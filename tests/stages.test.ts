import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors/AppError";
import { LIMITS, StorageService } from "@/lib/storage";
import { RepoDatabase } from "@/lib/storage/RepoDatabase";
import { itemsOf } from "@/lib/workspace/ordering";

let n = 0;
async function make() {
  const storage = new StorageService(new RepoDatabase(`stages-${n++}`));
  await storage.init();
  const board = (await storage.boardService.listBoards())[0];
  const snap = async () => (await storage.boardService.loadBoard(board.id))!;
  return { storage, board, snap };
}
const code = async (p: Promise<unknown>) => (await p.then(() => "ok", (e) => (e as AppError).code));

describe("stage management", () => {
  it("adds, renames (clearing the default key), recolors and reorders stages", async () => {
    const { storage, board, snap } = await make();
    const added = await storage.boardService.createColumn(board.id, "  Blocked ", "amber");
    expect(added.name).toBe("Blocked");
    expect((await snap()).columns.map((c) => c.name).at(-1)).toBe("Blocked");

    const first = (await snap()).columns[0];
    expect(first.seedKey).toBe("not-started");
    const renamed = await storage.boardService.updateColumn(first.id, { name: "Ideas", tone: "violet" });
    expect(renamed).toMatchObject({ name: "Ideas", seedKey: null, tone: "violet" });

    await storage.boardService.moveColumn(added.id, 0);
    const order = (await snap()).columns;
    expect(order[0].id).toBe(added.id);
    expect(order.map((c) => c.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("enforces the stage limit and keeps at least one stage", async () => {
    const { storage, board, snap } = await make();
    for (let i = (await snap()).columns.length; i < LIMITS.stagesPerBoard; i++) await storage.boardService.createColumn(board.id, `S${i}`, "neutral");
    expect(await code(storage.boardService.createColumn(board.id, "One too many", "neutral"))).toBe("LIMIT_REACHED");

    const { storage: s2, board: b2, snap: snap2 } = await make();
    const columns = (await snap2()).columns;
    for (const c of columns.slice(1)) await s2.boardService.deleteColumn(c.id, { kind: "move", toColumnId: columns[0].id });
    expect(await code(s2.boardService.deleteColumn(columns[0].id, { kind: "trash" }))).toBe("LAST_STAGE");
    expect((await s2.boardService.loadBoard(b2.id))!.items).toHaveLength(4);
  });

  it("moves items to another stage, or sends them to the trash, when a stage is deleted", async () => {
    const { storage, snap } = await make();
    const [a, b, c] = (await snap()).columns;
    await storage.boardService.deleteColumn(b.id, { kind: "move", toColumnId: a.id });
    let state = await snap();
    expect(state.columns).toHaveLength(3);
    expect(itemsOf(state.items, a.id).map((i) => i.order)).toEqual([0, 1]);

    await storage.boardService.deleteColumn(c.id, { kind: "trash" });
    state = await snap();
    expect(state.items).toHaveLength(3);
    expect(await storage.trash.count()).toBe(1);
    expect((await storage.integrity.run()).ok).toBe(true);
  });
});

describe("board management", () => {
  it("renames a board, reports what deleting it removes, and cascades the delete", async () => {
    const { storage, board } = await make();
    expect((await storage.boardService.renameBoard(board.id, " Home ")) ).toMatchObject({ name: "Home", seedKey: null });
    const other = await storage.boardService.createBoard("Other");
    const items = (await storage.boardService.loadBoard(board.id))!.items;
    await storage.notes.save(items[0].id, "note");
    await storage.trashService.trashItem(items[1].id);
    expect(await storage.boardService.boardStats(board.id)).toEqual({ columns: 4, items: 3, notes: 1, trash: 1 });

    await storage.boardService.deleteBoard(board.id);
    expect(await storage.boardService.loadBoard(board.id)).toBeNull();
    expect(await storage.items.count()).toBe(0);
    expect(await storage.notes.count()).toBe(0);
    expect(await storage.trash.count()).toBe(0);
    expect((await storage.integrity.run()).ok).toBe(true);
    expect(await code(storage.boardService.deleteBoard(other.id))).toBe("LAST_BOARD");
  });

  it("clears the default key only when the user edits the seeded text", async () => {
    const { storage, snap } = await make();
    const item = (await snap()).items[0];
    expect(item.seedKey).toBeTruthy();
    expect((await storage.boardService.updateItem(item.id, { priority: "low" }))?.seedKey).toBe(item.seedKey);
    expect((await storage.boardService.updateItem(item.id, { title: "Mine", seedKey: null }))?.seedKey).toBeNull();
  });
});
