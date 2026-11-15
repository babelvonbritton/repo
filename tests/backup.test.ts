import "fake-indexeddb/auto";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import { AppError, ERROR_CODES } from "@/lib/errors/AppError";
import { ErrorCenter } from "@/lib/errors/ErrorCenter";
import { ArchiveCodec } from "@/lib/backup/ArchiveCodec";
import { BackupService, type FileLike } from "@/lib/backup/BackupService";
import { MAX_ARCHIVE_BYTES } from "@/lib/backup/constants";
import { StorageService } from "@/lib/storage";
import { RepoDatabase } from "@/lib/storage/RepoDatabase";

let n = 0;
async function make() {
  const storage = new StorageService(new RepoDatabase(`backup-${n++}`));
  await storage.init();
  const errors = new ErrorCenter();
  return { storage, errors, svc: new BackupService(storage, errors, { minStepMs: 0 }) };
}
const noop = () => {};
const asFile = (bytes: Uint8Array, name = "test.zip"): FileLike => ({ name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });

/** Builds a ZIP from arbitrary data, bypassing the pre-backup self-check, to simulate foreign or tampered files. */
async function forge(data: unknown, tweak?: (files: Record<string, Uint8Array>) => Record<string, Uint8Array>) {
  const { dataBytes, manifest } = await ArchiveCodec.describe(data as never, Date.now(), "backup");
  const files = tweak ? tweak({ "manifest.json": strToU8(JSON.stringify(manifest)), "data.json": dataBytes }) : { "manifest.json": strToU8(JSON.stringify(manifest)), "data.json": dataBytes };
  return zipSync(files);
}

describe("backup flow", () => {
  it("round-trips: a created archive is a valid ZIP with JSON inside and restores identical data", async () => {
    const { storage, svc } = await make();
    const note = (await storage.items.all())[0];
    await storage.notes.save(note.id, "hello note");
    const before = await storage.snapshots.readAll();

    // jsdom-free environment has no DOM download; capture the zip by stubbing the saver through a Blob-free path
    (globalThis as { document?: unknown }).document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
    (globalThis.URL as { createObjectURL: unknown }).createObjectURL = () => "blob:x";
    (globalThis.URL as { revokeObjectURL: unknown }).revokeObjectURL = () => {};

    const created = await svc.createBackup(noop);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const files = unzipSync(created.value.zip);
    expect(Object.keys(files).sort()).toEqual(["data.json", "manifest.json"]);
    expect(JSON.parse(strFromU8(files["manifest.json"])).format).toBe("repo-backup");

    await storage.snapshots.replaceAll({ boards: [], columns: [], items: [], notes: [], trash: [], settings: [] });
    const plan = await svc.inspect(asFile(created.value.zip), noop);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const restored = await svc.restore(plan.value, { safetyBackup: false, decisions: new Map(), onRestored: async () => {} }, noop);
    expect(restored.ok).toBe(true);
    expect(await storage.snapshots.readAll()).toEqual(before);
  });

  it("encrypts backup data and requires the matching passphrase before restore", async () => {
    const { storage, svc } = await make();
    const before = await storage.snapshots.readAll();
    const created = await svc.createBackup(noop, "backup", "correct horse battery");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const files = unzipSync(created.value.zip);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest.formatVersion).toBe(2);
    expect(manifest.encryption).toMatchObject({ algorithm: "AES-GCM", kdf: "PBKDF2-SHA-256", iterations: 310_000 });
    expect(strFromU8(files["data.json"])).not.toContain('"boards"');

    const missing = await svc.inspect(asFile(created.value.zip), noop);
    expect(!missing.ok && missing.error.code).toBe("BACKUP_PASSWORD_REQUIRED");
    const wrong = await svc.inspect(asFile(created.value.zip), noop, "incorrect passphrase");
    expect(!wrong.ok && wrong.error.code).toBe("BACKUP_DECRYPT_FAILED");
    expect(await storage.snapshots.readAll()).toEqual(before);

    await storage.snapshots.replaceAll({ boards: [], columns: [], items: [], notes: [], trash: [], settings: [] });
    const restored = await svc.inspect(asFile(created.value.zip), noop, "correct horse battery");
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.data).toEqual(before);
    const outcome = await svc.restore(restored.value, { safetyBackup: false, decisions: new Map(), onRestored: async () => {} }, noop);
    expect(outcome.ok).toBe(true);
    expect(await storage.snapshots.readAll()).toEqual(before);
  });

  it("rejects tampered content (checksum), truncated files, foreign entries and oversized files", async () => {
    const { storage, svc } = await make();
    const data = await storage.snapshots.readAll();

    const tampered = await forge(data, (f) => ({ ...f, "data.json": strToU8(strFromU8(f["data.json"]).replace("Define your goal", "Hacked title with a different length")) }));
    const r1 = await svc.inspect(asFile(tampered), noop);
    expect(!r1.ok && r1.error.code).toBe("BACKUP_SIZE_MISMATCH");

    const sameSize = await forge(data, (f) => ({ ...f, "data.json": strToU8(strFromU8(f["data.json"]).replace("Define your goal", "Define your g0al")) }));
    const r2 = await svc.inspect(asFile(sameSize), noop);
    expect(!r2.ok && r2.error.code).toBe("BACKUP_CHECKSUM_MISMATCH");

    const good = await forge(data);
    const r3 = await svc.inspect(asFile(good.slice(0, good.length - 30)), noop);
    expect(!r3.ok && r3.error.code).toBe("BACKUP_NOT_ZIP");

    const r4 = await svc.inspect(asFile(strToU8("not a zip at all, just text")), noop);
    expect(!r4.ok && r4.error.code).toBe("BACKUP_NOT_ZIP");

    const evil = await forge(data, (f) => ({ ...f, "../evil.js": strToU8("alert(1)") }));
    const r5 = await svc.inspect(asFile(evil), noop);
    expect(!r5.ok && r5.error.code).toBe("BACKUP_UNEXPECTED_CONTENT");

    const r6 = await svc.inspect({ name: "big.zip", size: MAX_ARCHIVE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) }, noop);
    expect(!r6.ok && r6.error.code).toBe("BACKUP_FILE_TOO_LARGE");
  });

  it("rejects well-formed files whose data breaks the rules, before touching the database", async () => {
    const { storage, svc } = await make();
    const data = await storage.snapshots.readAll();
    const before = await storage.snapshots.readAll();
    const bad = structuredClone(data);
    bad.items[0].columnId = "missing-column";
    bad.items[1].priority = "urgent" as never;
    bad.items[2].title = "x".repeat(500);
    bad.notes.push({ itemId: bad.items[0].id, text: "y".repeat(4001), updatedAt: 1 });
    const result = await svc.inspect(asFile(await forge(bad)), noop);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("BACKUP_STRUCTURE_INVALID");
    expect(result.error.details).toContain("items[0].columnId");
    expect(result.error.details).toContain("items[1].priority");
    expect(result.error.details).toContain("items[2].title");
    expect(await storage.snapshots.readAll()).toEqual(before);
  });

  it("ignores unknown fields, including prototype-pollution keys, and reports them as notices", async () => {
    const { storage, svc } = await make();
    const data = JSON.parse(JSON.stringify(await storage.snapshots.readAll()));
    data.items[0].extra = "ignored";
    data.items[0]["__proto__"] = { polluted: true };
    const result = await svc.inspect(asFile(await forge(data)), noop);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings.some((w) => w.key === "warn.unknownFields")).toBe(true);
    expect(JSON.stringify(result.value.data.items[0])).not.toContain("extra");
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("keeps existing data when the write fails, and rolls back when verification fails", async () => {
    const { storage, svc } = await make();
    const original = await storage.snapshots.readAll();
    const empty = { boards: [], columns: [], items: [], notes: [], trash: [], settings: [] };
    const options = { safetyBackup: false, decisions: new Map(), onRestored: async () => {} };

    // 1) a failing write leaves the data exactly as it was (the transaction aborts)
    await storage.snapshots.replaceAll(empty);
    const plan1 = await svc.inspect(asFile(await forge(JSON.parse(JSON.stringify(original)))), noop);
    if (!plan1.ok) throw new Error("setup failed");
    const realReplace = storage.snapshots.replaceAll.bind(storage.snapshots);
    storage.snapshots.replaceAll = async () => { throw new DOMException("full", "QuotaExceededError"); };
    const failed = await svc.restore(plan1.value, options, noop);
    storage.snapshots.replaceAll = realReplace;
    expect(!failed.ok && failed.error.code).toBe("BACKUP_APPLY_FAILED");
    expect(await storage.snapshots.readAll()).toEqual(empty);

    // 2) data that fails the post-restore check is rolled back to what was there before
    const realRun = storage.integrity.run.bind(storage.integrity);
    storage.integrity.run = async () => ({ ok: false, checkedAt: 0, issues: [{ code: "ORPHAN_ITEM", id: "x", message: "forced" }] });
    const rolled = await svc.restore(plan1.value, options, noop);
    storage.integrity.run = realRun;
    expect(!rolled.ok && rolled.error.code).toBe("BACKUP_VERIFY_FAILED");
    expect(await storage.snapshots.readAll()).toEqual(empty);
  });
});

describe("error system", () => {
  it("maps browser and database errors to stable codes", () => {
    expect(AppError.from(new DOMException("full", "QuotaExceededError")).code).toBe("STORAGE_QUOTA");
    expect(AppError.from(Object.assign(new Error("x"), { name: "DatabaseClosedError" })).code).toBe("STORAGE_CLOSED");
    expect(AppError.from(Object.assign(new Error("x"), { name: "OpenFailedError" })).code).toBe("STORAGE_UNAVAILABLE");
    expect(AppError.from(new TypeError("boom")).code).toBe("UNEXPECTED");
  });

  it("has a title and hint for every error code", () => {
    for (const code of ERROR_CODES) {
      expect(en).toHaveProperty(`err.${code}.title`);
      expect(en).toHaveProperty(`err.${code}.hint`);
    }
  });

  it("logs every report, even when shown inline, and de-duplicates repeated toasts", () => {
    const center = new ErrorCenter();
    const toasts: unknown[] = [];
    center.subscribe((e) => toasts.push(e));
    center.report(new Error("a"), { action: "x" });
    center.report(new Error("a"), { action: "x" });
    center.report(new Error("b"), { action: "y", surface: "inline" });
    expect(toasts).toHaveLength(1);
    expect(center.diagnostics()).toContain("[y]");
  });
});
