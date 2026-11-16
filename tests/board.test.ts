import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { StorageService, ValidationError } from "@/lib/storage";
import { RepoDatabase } from "@/lib/storage/RepoDatabase";
import { applyMove, itemsOf } from "@/lib/workspace/ordering";

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

  it("validates item updates", async () => {
    const { service, snap } = await make();
    await expect(service.boardService.updateItem(snap.items[0].id, { title: "   " })).rejects.toBeInstanceOf(ValidationError);
    const updated = await service.boardService.updateItem(snap.items[0].id, { title: "  Renamed ", priority: "high" });
    expect(updated?.title).toBe("Renamed");
  });
});
