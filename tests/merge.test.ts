import "fake-indexeddb/auto";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { ArchiveCodec } from "@/lib/backup/ArchiveCodec";
import { BackupService, type FileLike } from "@/lib/backup/BackupService";
import { MergePlanner, type Decision } from "@/lib/backup/MergePlanner";
import type { RestorePlan } from "@/lib/backup/types";
import { ErrorCenter } from "@/lib/errors/ErrorCenter";
import { StorageService, type BackupData } from "@/lib/storage";
import { RepoDatabase } from "@/lib/storage/RepoDatabase";
import { itemsOf } from "@/lib/workspace/ordering";

let n = 0;
async function make() {
  const storage = new StorageService(new RepoDatabase(`merge-${n++}`));
  await storage.init();
  const svc = new BackupService(storage, new ErrorCenter(), { minStepMs: 0 });
  return { storage, svc };
}
const noop = () => {};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

async function zipOf(data: BackupData): Promise<FileLike> {
  const { dataBytes, manifest } = await ArchiveCodec.describe(data, Date.now(), "backup");
  const zip = zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)), "data.json": dataBytes });
  return { name: "backup.zip", size: zip.length, arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer };
}
async function inspect(svc: BackupService, data: BackupData): Promise<RestorePlan> {
  const out = await svc.inspect(await zipOf(data), noop);
  if (!out.ok) throw out.error;
  return out.value;
}
const apply = (svc: BackupService, plan: RestorePlan, decisions: Map<string, Decision> = new Map()) =>
  svc.restore(plan, { safetyBackup: false, decisions, onRestored: async () => {} }, noop);

describe("merge restore", () => {
  it("finds identical data and has nothing to do", async () => {
    const { storage, svc } = await make();
    const before = await storage.snapshots.readAll();
    const plan = await inspect(svc, clone(before));
    expect(plan.merge.totals).toMatchObject({ new: 0, differs: 0 });
    expect(plan.merge.totals.same).toBe(plan.total);
    const out = await apply(svc, plan);
    expect(out.ok && out.value).toMatchObject({ added: 0, replaced: 0, kept: 0 });
    expect(await storage.snapshots.readAll()).toEqual(before);
  });

  it("adds missing records as new at the end of their column, without moving existing ones", async () => {
    const { storage, svc } = await make();
    const backup = await storage.snapshots.readAll();
    const first = (await storage.items.all()).find((i) => i.order === 0)!;
    await storage.items.remove(first.id); // deleted since the backup was made
    const extra = await storage.items.create({ boardId: first.boardId, columnId: first.columnId, title: "Made after the backup" });

    const plan = await inspect(svc, clone(backup));
    expect(plan.merge.byKind.item).toEqual({ new: 1, same: 3, differs: 0 });
    expect((await apply(svc, plan)).ok).toBe(true);

    const column = itemsOf(await storage.items.all(), first.columnId);
    expect(column.map((i) => i.title)).toEqual([extra.title, first.title]); // restored item goes last
    expect(column.map((i) => i.order)).toEqual([0, 1]);
    expect((await storage.integrity.run()).ok).toBe(true);
  });

  it("lists the differences of a changed record and applies only what the user chooses", async () => {
    const { storage, svc } = await make();
    const backup = await storage.snapshots.readAll();
    const [a, b] = (await storage.items.all()).sort((x, y) => x.title.localeCompare(y.title));
    await storage.boardService.updateItem(a.id, { title: "Changed A", priority: "low" });
    await storage.boardService.updateItem(b.id, { title: "Changed B", dueDate: "2026-12-24" });
    await storage.notes.save(a.id, "note written after the backup");

    const original = (id: string) => backup.items.find((i) => i.id === id)!;
    const plan = await inspect(svc, clone(backup));
    const entryA = plan.merge.entries.find((e) => e.key === `item:${a.id}`)!;
    expect(entryA.status).toBe("differs");
    expect(entryA.diffs.map((d) => d.field).sort()).toEqual(["priority", "title"]);
    expect(entryA.diffs.find((d) => d.field === "title")).toMatchObject({ current: { value: "Changed A" }, incoming: { value: original(a.id).title } });

    // nothing is decided: both are kept
    expect((await apply(svc, plan)).ok).toBe(true);
    expect((await storage.items.get(a.id))!.title).toBe("Changed A");

    // replace only A
    const plan2 = await inspect(svc, clone(backup));
    const out = await apply(svc, plan2, new Map([[`item:${a.id}`, "replace" as const], [`item:${b.id}`, "skip" as const]]));
    expect(out.ok && out.value).toMatchObject({ replaced: 1, kept: 1 });
    expect((await storage.items.get(a.id))!.title).toBe(original(a.id).title);
    expect((await storage.items.get(b.id))!.title).toBe("Changed B");
    expect((await storage.notes.get(a.id))!.text).toBe("note written after the backup"); // not in the backup: untouched
  });

  it("flags an item that is in the trash now but on the board in the backup, and a note that differs", async () => {
    const { storage, svc } = await make();
    const item = (await storage.items.all())[0];
    await storage.notes.save(item.id, "old note");
    const backup = await storage.snapshots.readAll();
    await storage.notes.save(item.id, "new note");
    await storage.trashService.trashItem(item.id);

    const plan = await inspect(svc, clone(backup));
    const live = plan.merge.entries.find((e) => e.key === `item:${item.id}`)!;
    expect(live).toMatchObject({ status: "differs", hint: "trashedNow" });
    expect(live.diffs[0]).toMatchObject({ field: "location", current: { value: "trash" }, incoming: { value: "board" } });

    expect((await apply(svc, plan)).ok).toBe(true); // keep: stays in the trash
    expect(await storage.trash.count()).toBe(1);

    const plan2 = await inspect(svc, clone(backup));
    const noteEntry = plan2.merge.entries.find((e) => e.key === `note:${item.id}`)!;
    expect(noteEntry.status).toBe("differs");
    expect(noteEntry.diffs[0]).toMatchObject({ current: { value: "new note" }, incoming: { value: "old note" } });
    const out = await apply(svc, plan2, new Map([[`item:${item.id}`, "replace" as const]]));
    expect(out.ok).toBe(true);
    expect(await storage.trash.count()).toBe(0);
    expect((await storage.items.get(item.id))!.title).toBe(item.title);
    expect((await storage.notes.get(item.id))!.text).toBe("new note"); // the note written after the backup survives the restore
    expect((await storage.integrity.run()).ok).toBe(true);
  });

  it("keeps a live note when the backup puts its item in the trash", async () => {
    const { storage, svc } = await make();
    const item = (await storage.items.all())[0];
    await storage.notes.save(item.id, "old note");
    await storage.trashService.trashItem(item.id);
    const backup = await storage.snapshots.readAll(); // the item is in the trash, holding "old note"
    const entry = (await storage.trash.listNewestFirst())[0];
    await storage.trashService.restore(entry.id); // back on the board
    await storage.notes.save(item.id, "new note"); // edited after the backup

    const plan = await inspect(svc, clone(backup));
    const trashEntry = plan.merge.entries.find((e) => e.key === `trash:${item.id}`)!;
    expect(trashEntry).toMatchObject({ status: "differs", hint: "liveNow" });
    const out = await apply(svc, plan, new Map([[`trash:${item.id}`, "replace" as const]]));
    expect(out.ok).toBe(true);
    expect(await storage.items.get(item.id)).toBeUndefined();
    const kept = (await storage.trash.listNewestFirst())[0];
    expect(kept.note).toBe("new note"); // the live note moved into the trash entry, not the backup's "old note"
    expect((await storage.integrity.run()).ok).toBe(true);
  });

  it("lands a new item on the board its stage belongs to now, not the backup's board", async () => {
    const { storage } = await make();
    const base = await storage.snapshots.readAll();
    const current = clone(base);
    const incoming = clone(base);
    const other = { ...base.boards[0], id: "board-other", name: "Other", order: 1, seedKey: null };
    current.boards.push(other);
    incoming.boards.push(other);
    // the stage moved to the other board after the backup, taking its items with it
    current.columns[0].boardId = other.id;
    for (const item of current.items) if (item.columnId === current.columns[0].id) item.boardId = other.id;
    // the backup holds a new item in that stage, on the old board
    incoming.items.push({ ...base.items[0], id: "item-new", title: "New in the moved stage", seedKey: null, boardId: base.boards[0].id, columnId: current.columns[0].id, order: 99 });

    const result = MergePlanner.resolve(current, incoming, new Map());
    expect(result.data.items.find((i) => i.id === "item-new")!.boardId).toBe(other.id);
  });

  it("refuses to write when the data changed after the comparison", async () => {
    const { storage, svc } = await make();
    const plan = await inspect(svc, clone(await storage.snapshots.readAll()));
    await storage.boardService.createBoard("Created in another tab");
    const out = await apply(svc, plan);
    expect(!out.ok && out.error.code).toBe("BACKUP_STALE");
    expect(await storage.boards.count()).toBe(2);
  });

  it("refuses to write when the data changes while the restore is running", async () => {
    const { storage, svc } = await make();
    const plan = await inspect(svc, clone(await storage.snapshots.readAll()));
    const before = await storage.snapshots.readAll();
    // the apply step re-reads the data; make that re-read see a change that happened after the snapshot step
    const real = storage.snapshots.readAll.bind(storage.snapshots);
    let calls = 0;
    const spy = vi.spyOn(storage.snapshots, "readAll").mockImplementation(async () => {
      const data = await real();
      calls++;
      if (calls === 2) return { ...data, boards: [...data.boards, { ...data.boards[0], id: "board-mid", name: "Mid-restore", order: 99, seedKey: null }] };
      return data;
    });
    const out = await apply(svc, plan);
    expect(!out.ok && out.error.code).toBe("BACKUP_STALE");
    expect(await storage.snapshots.readAll()).toEqual(before);
    spy.mockRestore();
  });

  it("refuses to restore when the safety backup it just built does not verify", async () => {
    const { storage, svc } = await make();
    // node has no DOM download; stub it so the safety step can run
    (globalThis as { document?: unknown }).document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
    (globalThis.URL as { createObjectURL: unknown }).createObjectURL = () => "blob:x";
    (globalThis.URL as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    const plan = await inspect(svc, clone(await storage.snapshots.readAll()));
    const before = await storage.snapshots.readAll();
    const pack = vi.spyOn(ArchiveCodec, "pack").mockReturnValue(new Uint8Array([1, 2, 3]));
    const out = await svc.restore(plan, { safetyBackup: true, decisions: new Map(), onRestored: async () => {} }, noop);
    expect(!out.ok && out.error.code).toBe("BACKUP_ARCHIVE_INVALID");
    expect(await storage.snapshots.readAll()).toEqual(before);
    pack.mockRestore();
  });

  it("refuses a combination that would leave inconsistent data, without changing anything", async () => {
    const { storage, svc } = await make();
    const backup = clone(await storage.snapshots.readAll());
    // the backup says stage 1 belongs to a different board; replacing it would orphan the items already in it
    const other = { ...backup.boards[0], id: "board-other", name: "Other", order: 1 };
    backup.boards.push(other);
    backup.columns[0].boardId = other.id;
    backup.items = backup.items.filter((i) => i.columnId !== backup.columns[0].id);
    backup.notes = [];
    const before = await storage.snapshots.readAll();
    const plan = await inspect(svc, backup);
    const entry = plan.merge.entries.find((e) => e.key === `column:${backup.columns[0].id}`)!;
    expect(entry.diffs.map((d) => d.field)).toContain("board");

    const out = await apply(svc, plan, new Map([[entry.key, "replace" as const]]));
    expect(!out.ok && out.error.code).toBe("BACKUP_MERGE_INVALID");
    expect(await storage.snapshots.readAll()).toEqual(before);
  });
});
