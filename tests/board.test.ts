import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { StorageService, ValidationError } from "@/lib/storage";
import { RepoDatabase } from "@/lib/storage/RepoDatabase";
import { applyMove, formatDate, itemsOf, parseDate } from "@/lib/workspace/ordering";

let counter = 0;
async function make() {
  const service = new StorageService(new RepoDatabase(`board-${counter++}`));
  await service.init();
  const board = (await service.boardService.listBoards())[0];
  return { service, snap: (await service.boardService.loadBoard(board.id))! };
}

describe("board service", () => {
  it("moves across columns and the pure applyMove matches the database result", async () => {
    const { service, snap } = await make();
    const [a, b] = snap.columns;
    const item = itemsOf(snap.items, a.id)[0];
    const predicted = applyMove(snap.items, item.id, b.id, 0);
    await service.boardService.moveItem(item.id, b.id, 0);
    const stored = (await service.boardService.loadBoard(snap.board.id))!.items;
    const key = (list: typeof stored) => list.map((i) => `${i.id}:${i.columnId}:${i.order}`).sort();
    expect(key(stored)).toEqual(key(predicted));
    expect((await service.integrity.run()).ok).toBe(true);
  });

  it("rejects moves into another board's column", async () => {
    const { service, snap } = await make();
    const other = await service.boardService.createBoard("Other");
    const otherColumn = (await service.boardService.loadBoard(other.id))!.columns[0];
    await expect(service.boardService.moveItem(snap.items[0].id, otherColumn.id, 0)).rejects.toBeInstanceOf(ValidationError);
  });

  it("gives a new board a free position after a middle board is deleted", async () => {
    const { service } = await make();
    const b = await service.boardService.createBoard("B");
    await service.boardService.createBoard("C");
    await service.boardService.deleteBoard(b.id);
    const d = await service.boardService.createBoard("D");
    const boards = await service.boardService.listBoards();
    const orders = boards.map((x) => x.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect(d.order).toBe(3);
  });

  it("applyMove matches the database for same-column moves and cross-column moves to the middle and end", async () => {
    const cases: Array<{ toColumn: number; toIndex: number; from: "first" | "last" }> = [
      { toColumn: 0, toIndex: 2, from: "first" },
      { toColumn: 0, toIndex: 0, from: "last" },
      { toColumn: 1, toIndex: 1, from: "first" },
      { toColumn: 1, toIndex: 2, from: "first" },
    ];
    for (const c of cases) {
      const { service, snap } = await make();
      const [a, b] = snap.columns;
      // Three cards in the first stage and two in the second, so up/down and "middle" are meaningful.
      await service.items.create({ boardId: snap.board.id, columnId: a.id, title: "Extra A1" });
      await service.items.create({ boardId: snap.board.id, columnId: a.id, title: "Extra A2" });
      await service.items.create({ boardId: snap.board.id, columnId: b.id, title: "Extra B1" });
      const fresh = (await service.boardService.loadBoard(snap.board.id))!;
      const fromList = itemsOf(fresh.items, a.id);
      const moving = c.from === "first" ? fromList[0] : fromList[fromList.length - 1];
      const target = c.toColumn === 0 ? a : b;
      const predicted = applyMove(fresh.items, moving.id, target.id, c.toIndex);
      await service.boardService.moveItem(moving.id, target.id, c.toIndex);
      const stored = (await service.boardService.loadBoard(snap.board.id))!.items;
      const key = (list: typeof stored) => list.map((i) => `${i.id}:${i.columnId}:${i.order}`).sort();
      expect(key(stored)).toEqual(key(predicted));
      expect((await service.integrity.run()).ok).toBe(true);
    }
  });

  it("validates item updates", async () => {
    const { service, snap } = await make();
    await expect(service.boardService.updateItem(snap.items[0].id, { title: "   " })).rejects.toBeInstanceOf(ValidationError);
    const updated = await service.boardService.updateItem(snap.items[0].id, { title: "  Renamed ", priority: "high" });
    expect(updated?.title).toBe("Renamed");
  });
});

describe("date helpers", () => {
  it("parses and formats the same ISO day without a timezone shift", () => {
    const leap = parseDate("2024-02-29");
    expect(leap.getDate()).toBe(29);
    expect(leap.getMonth()).toBe(1);
    expect(formatDate("2024-02-29", "en-US")).toBe("Feb 29");
    expect(formatDate("2026-02-28", "en-US")).toBe("Feb 28");
  });
});
