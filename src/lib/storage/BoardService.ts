import type { RepoDatabase } from "./RepoDatabase";
import type { BoardRepository, ColumnRepository, ItemRepository } from "./repositories";
import { AppError } from "@/lib/errors/AppError";
import { Guard, ValidationError } from "./Guard";
import type { TrashService } from "./TrashService";
import { COLUMN_TONES, LIMITS, PRIORITIES, type Board, type Clock, type Column, type ColumnTone, type Item, type Priority } from "./types";

interface BoardDeps {
  boards: BoardRepository;
  columns: ColumnRepository;
  items: ItemRepository;
  trashService: TrashService;
}

/** What happens to the items of a stage that is being deleted. */
export type StageDeletion = { kind: "move"; toColumnId: string } | { kind: "trash" };

export interface BoardStats {
  columns: number;
  items: number;
  notes: number;
  trash: number;
}

export interface BoardSnapshot {
  board: Board;
  columns: Column[];
  items: Item[];
}

export interface ItemPatch {
  title?: string;
  summary?: string;
  label?: string;
  priority?: Priority;
  dueDate?: string | null;
  /** Pass null once the user edits seeded text, so the default is no longer localized over their words. */
  seedKey?: null;
}

/** Columns every new board starts with. `key` lets the UI localize names that were never renamed. */
const DEFAULT_COLUMNS: ReadonlyArray<{ key: string; name: string; tone: ColumnTone }> = [
  { key: "not-started", name: "Not started", tone: "neutral" },
  { key: "in-progress", name: "In progress", tone: "amber" },
  { key: "in-review", name: "In review", tone: "violet" },
  { key: "completed", name: "Completed", tone: "green" },
];

/** Board-level operations: loading a board, creating boards, editing items and moving them between columns. */
export class BoardService {
  constructor(private readonly db: RepoDatabase, private readonly repos: BoardDeps, private readonly clock: Clock) {}

  listBoards(): Promise<Board[]> {
    return this.repos.boards.listOrdered();
  }

  /** Loads one board with its columns (ordered) and all of its items. */
  async loadBoard(boardId: string): Promise<BoardSnapshot | null> {
    const board = await this.repos.boards.get(boardId);
    if (!board) return null;
    const [columns, items] = await Promise.all([
      this.repos.columns.listByBoard(boardId),
      this.db.items.where("boardId").equals(boardId).toArray(),
    ]);
    return { board, columns, items };
  }

  /** Creates a board together with the default columns. */
  createBoard(name: string): Promise<Board> {
    return this.db.transaction("rw", [this.db.boards, this.db.columns], async () => {
      const board = await this.repos.boards.create(name);
      for (const c of DEFAULT_COLUMNS) await this.repos.columns.create(board.id, c.name, c.tone, c.key);
      return board;
    });
  }

  /** Applies validated changes to an item's own fields (not its column or note). */
  async updateItem(itemId: string, patch: ItemPatch): Promise<Item | null> {
    const current = await this.repos.items.get(itemId);
    if (!current) return null;
    const next: Item = {
      ...current,
      title: patch.title === undefined ? current.title : Guard.text(patch.title, "title", LIMITS.itemTitle, { required: true, trim: true }),
      summary: patch.summary === undefined ? current.summary : Guard.text(patch.summary, "summary", LIMITS.itemSummary, { trim: true }),
      label: patch.label === undefined ? current.label : Guard.text(patch.label, "label", LIMITS.itemLabel, { trim: true }),
      priority: patch.priority === undefined ? current.priority : Guard.oneOf(patch.priority, "priority", PRIORITIES),
      dueDate: patch.dueDate === undefined ? current.dueDate : Guard.dateOrNull(patch.dueDate, "due date"),
      seedKey: patch.seedKey === null ? null : current.seedKey,
      updatedAt: this.clock(),
    };
    await this.repos.items.put(next);
    return next;
  }

  /** Moves an item to a column position and renumbers both affected columns. The target must belong to the same board. */
  moveItem(itemId: string, toColumnId: string, toIndex: number): Promise<void> {
    const { items, columns } = this.repos;
    return this.db.transaction("rw", [this.db.items, this.db.columns], async () => {
      const item = await items.get(itemId);
      if (!item) return;
      const target = await columns.get(toColumnId);
      if (!target || target.boardId !== item.boardId) throw new ValidationError("column", "column is not part of this board");
      const fromId = item.columnId;
      const list = (await items.listByColumn(toColumnId)).filter((i) => i.id !== itemId);
      list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, { ...item, columnId: toColumnId, updatedAt: this.clock() });
      const writes = list.map((it, order) => ({ ...it, order }));
      if (fromId !== toColumnId) {
        const source = (await items.listByColumn(fromId)).filter((i) => i.id !== itemId);
        writes.push(...source.map((it, order) => ({ ...it, order })));
      }
      await this.db.items.bulkPut(writes);
    });
  }

  // ------------------------------------------------------------ boards

  /** Renames a board. A renamed default board is no longer localized, since the name is now the user's own. */
  async renameBoard(id: string, name: string): Promise<Board | null> {
    const board = await this.repos.boards.get(id);
    if (!board) return null;
    const next: Board = { ...board, name: Guard.text(name, "board name", LIMITS.boardName, { required: true, trim: true }), seedKey: null, updatedAt: this.clock() };
    await this.repos.boards.put(next);
    return next;
  }

  /** Counts what deleting a board would remove, so the user can be told before confirming. */
  async boardStats(id: string): Promise<BoardStats> {
    const [columns, items, trash] = await Promise.all([
      this.db.columns.where("boardId").equals(id).count(),
      this.db.items.where("boardId").equals(id).primaryKeys(),
      this.db.trash.where("boardId").equals(id).count(),
    ]);
    const notes = items.length ? await this.db.notes.where("itemId").anyOf(items).count() : 0;
    return { columns, items: items.length, notes, trash };
  }

  /** Permanently deletes a board with its stages, items, notes and trash entries. The last board cannot be deleted. */
  deleteBoard(id: string): Promise<void> {
    const d = this.db;
    return d.transaction("rw", [d.boards, d.columns, d.items, d.notes, d.trash], async () => {
      if ((await d.boards.count()) <= 1) throw new AppError("LAST_BOARD");
      const itemIds = await d.items.where("boardId").equals(id).primaryKeys();
      await d.notes.bulkDelete(itemIds);
      await d.items.bulkDelete(itemIds);
      await d.trash.where("boardId").equals(id).delete();
      await d.columns.where("boardId").equals(id).delete();
      await d.boards.delete(id);
    });
  }

  // ------------------------------------------------------------ stages

  /** Adds a stage at the end of a board (at most LIMITS.stagesPerBoard). */
  createColumn(boardId: string, name: string, tone: ColumnTone): Promise<Column> {
    return this.db.transaction("rw", [this.db.boards, this.db.columns], async () => {
      if (!(await this.repos.boards.get(boardId))) throw new AppError("STORAGE_FAILED", { details: "Board no longer exists" });
      const count = await this.db.columns.where("boardId").equals(boardId).count();
      if (count >= LIMITS.stagesPerBoard) throw new AppError("LIMIT_REACHED", { severity: "warning", context: { what: "stages", max: LIMITS.stagesPerBoard } });
      return this.repos.columns.create(boardId, name, tone);
    });
  }

  /** Renames a stage and/or changes its color tone. Renaming clears the localization key of default stages. */
  async updateColumn(id: string, patch: { name?: string; tone?: ColumnTone }): Promise<Column | null> {
    const current = await this.repos.columns.get(id);
    if (!current) return null;
    const next: Column = {
      ...current,
      name: patch.name === undefined ? current.name : Guard.text(patch.name, "column name", LIMITS.columnName, { required: true, trim: true }),
      seedKey: patch.name === undefined ? current.seedKey : null,
      tone: patch.tone === undefined ? current.tone : Guard.oneOf(patch.tone, "column tone", COLUMN_TONES),
      updatedAt: this.clock(),
    };
    await this.repos.columns.put(next);
    return next;
  }

  /** Moves a stage to a new position and renumbers the board's stages. */
  moveColumn(id: string, toIndex: number): Promise<void> {
    return this.db.transaction("rw", [this.db.columns], async () => {
      const column = await this.repos.columns.get(id);
      if (!column) return;
      const list = (await this.repos.columns.listByBoard(column.boardId)).filter((c) => c.id !== id);
      list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, column);
      await this.db.columns.bulkPut(list.map((c, order) => ({ ...c, order, updatedAt: c.id === id ? this.clock() : c.updatedAt })));
    });
  }

  /** Deletes a stage. Its items are moved to another stage or sent to the trash. The last stage cannot be deleted. */
  deleteColumn(id: string, strategy: StageDeletion): Promise<void> {
    const d = this.db;
    return d.transaction("rw", [d.columns, d.items, d.notes, d.trash], async () => {
      const column = await this.repos.columns.get(id);
      if (!column) return;
      const siblings = await this.repos.columns.listByBoard(column.boardId);
      if (siblings.length <= 1) throw new AppError("LAST_STAGE");
      const items = await this.repos.items.listByColumn(id);
      if (items.length > 0) {
        if (strategy.kind === "move") {
          const target = siblings.find((c) => c.id === strategy.toColumnId && c.id !== id);
          if (!target) throw new ValidationError("column", "target stage is not valid", "invalid");
          const start = await this.repos.items.nextOrder(target.id);
          await d.items.bulkPut(items.map((it, i) => ({ ...it, columnId: target.id, order: start + i, updatedAt: this.clock() })));
        } else {
          for (const it of items) await this.repos.trashService.trashItem(it.id);
        }
      }
      await this.repos.columns.remove(id);
      await d.columns.bulkPut(siblings.filter((c) => c.id !== id).map((c, order) => ({ ...c, order })));
    });
  }
}
