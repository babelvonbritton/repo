import Dexie from "dexie";
import { BaseRepository } from "./BaseRepository";
import { Guard } from "./Guard";
import { createId } from "./utils";
import {
  COLUMN_TONES,
  LIMITS,
  PRIORITIES,
  type Board,
  type Column,
  type ColumnTone,
  type Item,
  type Note,
  type Priority,
  type SettingRecord,
  type TrashEntry,
} from "./types";

/** Boards store: ordered list of workspaces. */
export class BoardRepository extends BaseRepository<Board, string> {
  listOrdered(): Promise<Board[]> {
    return this.table.orderBy("order").toArray();
  }

  async create(name: string, seedKey: string | null = null, id: string = createId()): Promise<Board> {
    const now = this.clock();
    const board: Board = {
      id,
      name: Guard.text(name, "board name", LIMITS.boardName, { required: true, trim: true }),
      seedKey,
      order: await this.table.count(),
      createdAt: now,
      updatedAt: now,
    };
    await this.table.add(board);
    return board;
  }
}

/** Columns store: stages of a board, read in order through the [boardId+order] index. */
export class ColumnRepository extends BaseRepository<Column, string> {
  listByBoard(boardId: string): Promise<Column[]> {
    return this.table
      .where("[boardId+order]")
      .between([boardId, Dexie.minKey], [boardId, Dexie.maxKey])
      .toArray();
  }

  async create(boardId: string, name: string, tone: ColumnTone = "neutral", seedKey: string | null = null, id: string = createId()): Promise<Column> {
    const now = this.clock();
    const column: Column = {
      id,
      boardId,
      name: Guard.text(name, "column name", LIMITS.columnName, { required: true, trim: true }),
      seedKey,
      tone: Guard.oneOf(tone, "column tone", COLUMN_TONES),
      order: await this.table.where("boardId").equals(boardId).count(),
      createdAt: now,
      updatedAt: now,
    };
    await this.table.add(column);
    return column;
  }
}

export interface NewItemInput {
  /** Only for built-in sample data; normally a unique id is generated. */
  id?: string;
  boardId: string;
  columnId: string;
  title: string;
  summary?: string;
  label?: string;
  priority?: Priority;
  dueDate?: string | null;
  seedKey?: string | null;
}

/** Items store: tasks ordered inside a column through the [columnId+order] index. */
export class ItemRepository extends BaseRepository<Item, string> {
  listByColumn(columnId: string): Promise<Item[]> {
    return this.table
      .where("[columnId+order]")
      .between([columnId, Dexie.minKey], [columnId, Dexie.maxKey])
      .toArray();
  }

  /** Next free position at the end of a column. */
  async nextOrder(columnId: string): Promise<number> {
    const last = await this.table
      .where("[columnId+order]")
      .between([columnId, Dexie.minKey], [columnId, Dexie.maxKey])
      .last();
    return last ? last.order + 1 : 0;
  }

  async create(input: NewItemInput): Promise<Item> {
    const now = this.clock();
    const item: Item = {
      id: input.id ?? createId(),
      boardId: input.boardId,
      columnId: input.columnId,
      title: Guard.text(input.title, "title", LIMITS.itemTitle, { required: true, trim: true }),
      summary: Guard.text(input.summary ?? "", "summary", LIMITS.itemSummary, { trim: true }),
      label: Guard.text(input.label ?? "", "label", LIMITS.itemLabel, { trim: true }),
      seedKey: input.seedKey ?? null,
      priority: Guard.oneOf(input.priority ?? "medium", "priority", PRIORITIES),
      dueDate: Guard.dateOrNull(input.dueDate, "due date"),
      order: await this.nextOrder(input.columnId),
      createdAt: now,
      updatedAt: now,
    };
    await this.table.add(item);
    return item;
  }
}

/** Notes store: one long note per item, kept apart so lists never load note text. */
export class NoteRepository extends BaseRepository<Note, string> {
  /** Saves a note (max 4000 characters). Empty text removes the note. */
  async save(itemId: string, text: string): Promise<Note | null> {
    const clean = Guard.text(text, "note", LIMITS.note);
    if (clean.length === 0) {
      await this.table.delete(itemId);
      return null;
    }
    const note: Note = { itemId, text: clean, updatedAt: this.clock() };
    await this.table.put(note);
    return note;
  }

  /** Lists note ids only, used by integrity checks without loading text. */
  ids(): Promise<string[]> {
    return this.table.toCollection().primaryKeys();
  }
}

/** Trash store: deleted item snapshots, indexed by deletedAt and expiresAt. */
export class TrashRepository extends BaseRepository<TrashEntry, string> {
  listNewestFirst(): Promise<TrashEntry[]> {
    return this.table.orderBy("deletedAt").reverse().toArray();
  }

  /** Permanently removes entries whose retention period ended. Returns how many were removed. */
  purgeExpired(now: number): Promise<number> {
    return this.table.where("expiresAt").belowOrEqual(now).delete();
  }
}

/** Settings store: small key/value records kept in IndexedDB. */
export class SettingsRepository extends BaseRepository<SettingRecord, string> {
  async read(key: string): Promise<SettingRecord["value"] | undefined> {
    return (await this.table.get(key))?.value;
  }

  async write(key: string, value: SettingRecord["value"]): Promise<void> {
    await this.table.put({ key, value });
  }
}
