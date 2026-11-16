import type { Msg } from "@/i18n/types";
import { AppError } from "@/lib/errors/AppError";
import type { ErrorCenter } from "@/lib/errors/ErrorCenter";
import type { BackupData, StorageService } from "@/lib/storage";
import { ArchiveCodec } from "./ArchiveCodec";
import { BackupCrypto } from "./BackupCrypto";
import { BackupValidator } from "./BackupValidator";
import { BACKUP_FORMAT_VERSION, MAX_ARCHIVE_BYTES, STORE_NAMES, type StoreName } from "./constants";
import { FileSaver } from "./FileSaver";
import { sha256Hex } from "./hash";
import { StepRunner, type StepDef, type StepOutcome } from "./StepRunner";
import { MergePlanner, type Decision, type MergeResult } from "./MergePlanner";
import type { BackupKind, BackupManifest, BackupResult, Outcome, RestorePlan, StepState, VerifiedArchive } from "./types";

/** The part of a File the service needs (also satisfied by test doubles). */
export interface FileLike {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface RestoreOptions {
  safetyBackup: boolean;
  safetyPassphrase?: string;
  /** The user's choice for each record that differs, keyed by MergeEntry.key. Anything not listed is kept as it is. */
  decisions: ReadonlyMap<string, Decision>;
  /** Called after data is replaced so the UI can reload its state. */
  onRestored: () => Promise<void>;
}

type Progress = (steps: StepState[]) => void;

const pad = (n: number) => String(n).padStart(2, "0");
const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

function countsOf(data: BackupData): Record<StoreName, number> {
  return Object.fromEntries(STORE_NAMES.map((n) => [n, data[n].length])) as Record<StoreName, number>;
}
const totalOf = (counts: Record<StoreName, number>) => STORE_NAMES.reduce((sum, n) => sum + counts[n], 0);

/** Creates, verifies and restores backups. Every flow reports step by step and returns an Outcome instead of throwing. */
export class BackupService {
  constructor(
    private readonly storage: StorageService,
    private readonly errors: ErrorCenter,
    private readonly options: { minStepMs?: number; clock?: () => number } = {},
  ) {}

  private now(): number {
    return (this.options.clock ?? Date.now)();
  }

  private runner<C>(steps: StepDef<C>[]): StepRunner<C> {
    return new StepRunner(steps, this.errors, this.options.minStepMs);
  }

  static fileName(kind: BackupKind, ms: number): string {
    const d = new Date(ms);
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `repo-${kind === "safety" ? "safety-backup" : "backup"}-${stamp}.zip`;
  }

  /** Record counts now in the database, for comparing with a backup before restoring. */
  async currentCounts(): Promise<Record<StoreName, number>> {
    return countsOf(await this.storage.snapshots.readAll());
  }

  // ---------------------------------------------------------------- shared building blocks

  /** Unpacks, checks metadata and checksums, and validates a ZIP. Used by restore and to verify new backups. */
  async verifyArchive(zip: Uint8Array, passphrase?: string): Promise<VerifiedArchive> {
    const { manifestBytes, dataBytes } = ArchiveCodec.unpack(zip);
    const manifest = BackupValidator.validateManifest(ArchiveCodec.parseJson(manifestBytes, "BACKUP_MANIFEST_INVALID", "manifest.json"));
    const payload = manifest.encryption ? await BackupCrypto.decrypt(dataBytes, manifest.encryption, passphrase) : dataBytes;
    const raw = await this.verifyContents(manifest, payload);
    const result = BackupValidator.validateData(raw, this.now());
    return { manifest, data: result.data, warnings: result.warnings, total: result.total, counts: countsOf(result.data) };
  }

  /** Size and checksum checks of data.json against the manifest, overall and per store. Returns the parsed JSON. */
  private async verifyContents(manifest: BackupManifest, dataBytes: Uint8Array): Promise<unknown> {
    const file = manifest.files[0];
    if (dataBytes.length !== file.bytes) throw new AppError("BACKUP_SIZE_MISMATCH", { details: `data.json is ${dataBytes.length} bytes, manifest says ${file.bytes}` });
    const actual = await sha256Hex(dataBytes);
    if (actual !== file.sha256) throw new AppError("BACKUP_CHECKSUM_MISMATCH", { details: `data.json SHA-256\nexpected ${file.sha256}\nfound    ${actual}` });
    const raw = ArchiveCodec.parseJson(dataBytes, "BACKUP_STRUCTURE_INVALID", "data.json");
    if (typeof raw !== "object" || raw === null) throw new AppError("BACKUP_STRUCTURE_INVALID", { details: "data.json must be an object" });
    for (const name of STORE_NAMES) {
      const list = (raw as Record<string, unknown>)[name];
      if (!Array.isArray(list)) throw new AppError("BACKUP_STRUCTURE_INVALID", { details: `${name} must be a list` });
      const expected = manifest.stores[name];
      if (list.length !== expected.count) throw new AppError("BACKUP_CHECKSUM_MISMATCH", { details: `${name}: ${list.length} records, manifest says ${expected.count}` });
      if ((await sha256Hex(new TextEncoder().encode(JSON.stringify(list)))) !== expected.sha256) {
        throw new AppError("BACKUP_CHECKSUM_MISMATCH", { details: `Checksum of store "${name}" does not match the manifest` });
      }
    }
    return raw;
  }

  // ---------------------------------------------------------------- create a backup

  /** Reads, checks, packages, compresses, re-verifies and saves a backup ZIP. */
  async createBackup(onChange: Progress, kind: BackupKind = "backup", passphrase?: string): Promise<Outcome<BackupResult>> {
    interface Ctx { data?: BackupData; noticeCount: number; dataBytes?: Uint8Array; archiveDataBytes?: Uint8Array; manifest?: BackupManifest; zip?: Uint8Array; fileName?: string; total: number }
    const ctx: Ctx = { noticeCount: 0, total: 0 };
    const steps: StepDef<Ctx>[] = [
      {
        id: "collect",
        titleKey: "step.collect",
        run: async (c) => {
          try {
            c.data = await this.storage.snapshots.readAll();
          } catch (e) {
            throw new AppError("BACKUP_COLLECT_FAILED", { cause: e, details: AppError.from(e).details });
          }
          const n = countsOf(c.data);
          return { detail: { key: "detail.collected", vars: { boards: n.boards, columns: n.columns, items: n.items, notes: n.notes, trash: n.trash } } };
        },
      },
      {
        id: "selfcheck",
        titleKey: "step.selfcheck",
        run: async (c) => {
          try {
            const result = BackupValidator.validateData(JSON.parse(JSON.stringify(c.data)), this.now());
            c.noticeCount = result.warnings.length;
            c.total = result.total;
            const outcome: StepOutcome = result.warnings.length
              ? { warning: true, detail: { key: "detail.validNotices", vars: { total: result.total, count: result.warnings.length } } }
              : { detail: { key: "detail.valid", vars: { total: result.total } } };
            return outcome;
          } catch (e) {
            const inner = AppError.from(e);
            throw new AppError("BACKUP_SELFCHECK_FAILED", { cause: e, details: inner.details });
          }
        },
      },
      {
        id: "package",
        titleKey: "step.package",
        run: async (c) => {
          try {
            const { dataBytes, manifest } = await ArchiveCodec.describe(c.data!, this.now(), kind);
            c.dataBytes = dataBytes;
            c.archiveDataBytes = dataBytes;
            c.manifest = manifest;
            return { detail: { key: "detail.packaged", vars: { size: kb(dataBytes.length), hash: manifest.files[0].sha256.slice(0, 12) } } };
          } catch (e) {
            if (e instanceof AppError) throw e;
            throw new AppError("BACKUP_PACKAGE_FAILED", { cause: e, details: AppError.from(e).details });
          }
        },
      },
      {
        id: "encrypt",
        titleKey: "step.encrypt",
        run: async (c) => {
          if (passphrase === undefined) return { skipped: true, detail: { key: "detail.encryptionSkipped" } };
          const encrypted = await BackupCrypto.encrypt(c.dataBytes!, passphrase);
          c.archiveDataBytes = encrypted.data;
          c.manifest!.formatVersion = BACKUP_FORMAT_VERSION;
          c.manifest!.encryption = encrypted.metadata;
          return { detail: { key: "detail.encrypted" } };
        },
      },
      {
        id: "compress",
        titleKey: "step.compress",
        run: async (c) => {
          try {
            c.zip = ArchiveCodec.pack(c.manifest!, c.archiveDataBytes!);
            return { detail: { key: "detail.compressed", vars: { size: kb(c.zip.length), original: kb(c.archiveDataBytes!.length) } } };
          } catch (e) {
            throw new AppError("BACKUP_PACKAGE_FAILED", { cause: e, details: AppError.from(e).details });
          }
        },
      },
      {
        id: "verifyArchive",
        titleKey: "step.verifyArchive",
        run: async (c) => {
          try {
            const plan = await this.verifyArchive(c.zip!, passphrase);
            if (plan.total !== c.total) throw new Error(`record count differs after round trip (${plan.total} vs ${c.total})`);
            return { detail: { key: "detail.archiveVerified", vars: { total: plan.total } } };
          } catch (e) {
            throw new AppError("BACKUP_ARCHIVE_INVALID", { cause: e, details: AppError.from(e).details });
          }
        },
      },
      {
        id: "save",
        titleKey: "step.save",
        run: async (c) => {
          c.fileName = BackupService.fileName(kind, c.manifest!.createdAtMs);
          FileSaver.download(c.zip!, c.fileName);
          return { detail: { key: "detail.saved", vars: { name: c.fileName } } };
        },
      },
    ];
    const outcome = await this.runner(steps).run(ctx, onChange, "backup");
    if (!outcome.ok) return outcome;
    return { ok: true, value: { fileName: ctx.fileName!, bytes: ctx.zip!.length, zip: ctx.zip!, manifest: ctx.manifest!, total: ctx.total } };
  }

  // ---------------------------------------------------------------- inspect a file before restoring

  /** Reads and verifies a backup file completely. Nothing is written to the database. */
  async inspect(file: FileLike, onChange: Progress, passphrase?: string): Promise<Outcome<RestorePlan>> {
    interface Ctx { bytes?: Uint8Array; manifestBytes?: Uint8Array; dataBytes?: Uint8Array; manifest?: BackupManifest; raw?: unknown; result?: ReturnType<typeof BackupValidator.validateData>; plan?: RestorePlan }
    const ctx: Ctx = {};
    const steps: StepDef<Ctx>[] = [
      {
        id: "readFile",
        titleKey: "step.readFile",
        run: async (c) => {
          if (file.size > MAX_ARCHIVE_BYTES) throw new AppError("BACKUP_FILE_TOO_LARGE", { details: `${file.size} bytes` });
          try {
            c.bytes = new Uint8Array(await file.arrayBuffer());
          } catch (e) {
            throw new AppError("BACKUP_FILE_READ_FAILED", { cause: e, details: AppError.from(e).details });
          }
          return { detail: { key: "detail.read", vars: { name: file.name, size: kb(c.bytes.length) } } };
        },
      },
      {
        id: "unpack",
        titleKey: "step.unpack",
        run: async (c) => {
          const { manifestBytes, dataBytes } = ArchiveCodec.unpack(c.bytes!);
          c.manifestBytes = manifestBytes;
          c.dataBytes = dataBytes;
          return { detail: { key: "detail.unpacked" } };
        },
      },
      {
        id: "metadata",
        titleKey: "step.metadata",
        run: async (c) => {
          c.manifest = BackupValidator.validateManifest(ArchiveCodec.parseJson(c.manifestBytes!, "BACKUP_MANIFEST_INVALID", "manifest.json"));
          const m = c.manifest;
          return { detail: { key: "detail.metadata", vars: { format: m.formatVersion, date: m.createdAt.slice(0, 16).replace("T", " "), version: m.app.version } } };
        },
      },
      {
        id: "decrypt",
        titleKey: "step.decrypt",
        run: async (c) => {
          if (!c.manifest!.encryption) return { skipped: true, detail: { key: "detail.decryptionSkipped" } };
          c.dataBytes = await BackupCrypto.decrypt(c.dataBytes!, c.manifest!.encryption, passphrase);
          return { detail: { key: "detail.decrypted" } };
        },
      },
      {
        id: "checksum",
        titleKey: "step.checksum",
        run: async (c) => {
          c.raw = await this.verifyContents(c.manifest!, c.dataBytes!);
          return { detail: { key: "detail.checksum", vars: { hash: c.manifest!.files[0].sha256.slice(0, 12), stores: STORE_NAMES.length } } };
        },
      },
      {
        id: "structure",
        titleKey: "step.structure",
        run: async (c) => {
          const result = BackupValidator.validateData(c.raw, this.now());
          c.result = result;
          const detail: Msg = result.warnings.length ? { key: "detail.validNotices", vars: { total: result.total, count: result.warnings.length } } : { key: "detail.valid", vars: { total: result.total } };
          return { detail, warning: result.warnings.length > 0 };
        },
      },
      {
        id: "compare",
        titleKey: "step.compare",
        run: async (c) => {
          let current: BackupData;
          try {
            current = await this.storage.snapshots.readAll();
          } catch (e) {
            throw new AppError("BACKUP_COLLECT_FAILED", { cause: e, details: AppError.from(e).details });
          }
          const result = c.result!;
          const merge = MergePlanner.plan(current, result.data);
          const fingerprint = await sha256Hex(new TextEncoder().encode(JSON.stringify(current)));
          c.plan = { fileName: file.name, manifest: c.manifest!, data: result.data, warnings: result.warnings, total: result.total, counts: countsOf(result.data), current, merge, fingerprint };
          const { new: added, same, differs } = merge.totals;
          return { detail: { key: "detail.compared", vars: { added, same, differs } }, warning: differs > 0 };
        },
      },
    ];
    const outcome = await this.runner(steps).run(ctx, onChange, "restore.inspect");
    return outcome.ok ? { ok: true, value: ctx.plan! } : outcome;
  }

  // ---------------------------------------------------------------- apply the user's decisions

  /**
   * Merges the backup into the current data as the user decided: new records are added, records marked "replace"
   * are overwritten, everything else is untouched. The write is one atomic transaction, the result is verified, and
   * the previous data is put back if verification fails. If the data changed since the comparison, nothing is written.
   */
  async restore(plan: RestorePlan, options: RestoreOptions, onChange: Progress): Promise<Outcome<MergeResult>> {
    interface Ctx { previous?: BackupData; merged?: MergeResult }
    const ctx: Ctx = {};
    const steps: StepDef<Ctx>[] = [
      {
        id: "snapshot",
        titleKey: "step.snapshot",
        run: async (c) => {
          try {
            c.previous = await this.storage.snapshots.readAll();
          } catch (e) {
            throw new AppError("BACKUP_COLLECT_FAILED", { cause: e, details: AppError.from(e).details });
          }
          const fingerprint = await sha256Hex(new TextEncoder().encode(JSON.stringify(c.previous)));
          if (fingerprint !== plan.fingerprint) throw new AppError("BACKUP_STALE", { details: "The data changed after the comparison was made." });
          return { detail: { key: "detail.snapshot", vars: { total: totalOf(countsOf(c.previous)) } } };
        },
      },
      {
        id: "safety",
        titleKey: "step.safety",
        run: async (c) => {
          if (!options.safetyBackup) return { skipped: true, detail: { key: "detail.safetySkipped" } };
          const { dataBytes, manifest } = await ArchiveCodec.describe(c.previous!, this.now(), "safety");
          let archiveData = dataBytes;
          if (options.safetyPassphrase !== undefined) {
            const encrypted = await BackupCrypto.encrypt(dataBytes, options.safetyPassphrase);
            archiveData = encrypted.data;
            manifest.formatVersion = BACKUP_FORMAT_VERSION;
            manifest.encryption = encrypted.metadata;
          }
          const zip = ArchiveCodec.pack(manifest, archiveData);
          try {
            await this.verifyArchive(zip, options.safetyPassphrase);
          } catch (e) {
            throw new AppError("BACKUP_ARCHIVE_INVALID", { cause: e, details: AppError.from(e).details });
          }
          const name = BackupService.fileName("safety", manifest.createdAtMs);
          FileSaver.download(zip, name);
          return { detail: { key: "detail.saved", vars: { name } } };
        },
      },
      {
        id: "apply",
        titleKey: "step.apply",
        run: async (c) => {
          // The data may have changed while the safety backup was being built; check again right before writing.
          let current: BackupData;
          try {
            current = await this.storage.snapshots.readAll();
          } catch (e) {
            throw new AppError("BACKUP_COLLECT_FAILED", { cause: e, details: AppError.from(e).details });
          }
          const fingerprint = await sha256Hex(new TextEncoder().encode(JSON.stringify(current)));
          if (fingerprint !== plan.fingerprint) throw new AppError("BACKUP_STALE", { details: "The data changed after the comparison was made." });
          c.merged = MergePlanner.resolve(plan.current, plan.data, options.decisions, this.now());
          try {
            await this.storage.snapshots.replaceAll(c.merged.data);
          } catch (e) {
            throw new AppError("BACKUP_APPLY_FAILED", { cause: e, details: AppError.from(e).details });
          }
          return { detail: { key: "detail.applied", vars: { total: c.merged.total } } };
        },
      },
      {
        id: "verifyRestore",
        titleKey: "step.verifyRestore",
        run: async (c) => {
          let problem = "";
          try {
            const now = countsOf(await this.storage.snapshots.readAll());
            const expected = countsOf(c.merged!.data);
            const mismatch = STORE_NAMES.filter((n) => now[n] !== expected[n]);
            const integrity = await this.storage.integrity.run();
            if (mismatch.length) problem = `Record counts differ in: ${mismatch.join(", ")}`;
            else if (!integrity.ok) problem = integrity.issues.slice(0, 8).map((i) => `${i.code} ${i.id}`).join("\n");
          } catch (e) {
            problem = AppError.from(e).details ?? "verification failed";
          }
          if (!problem) return { detail: { key: "detail.restoreVerified" } };
          try {
            await this.storage.snapshots.replaceAll(c.previous!);
          } catch (e) {
            throw new AppError("BACKUP_ROLLBACK_FAILED", { cause: e, details: `${problem}\nRollback error: ${AppError.from(e).details}` });
          }
          throw new AppError("BACKUP_VERIFY_FAILED", { details: problem });
        },
      },
      {
        id: "refresh",
        titleKey: "step.refresh",
        run: async () => {
          await options.onRestored();
          return { detail: { key: "detail.refreshed" } };
        },
      },
    ];
    const outcome = await this.runner(steps).run(ctx, onChange, "restore.apply");
    return outcome.ok ? { ok: true, value: ctx.merged! } : outcome;
  }
}
