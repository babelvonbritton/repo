import Dexie, { type Table } from "dexie";
import type { Board, Column, Item, Note, SettingRecord, TrashEntry } from "./types";

/**
 * IndexedDB schema with one granular store per concern.
 * Indexes: compound [parent+order] keys give ordered reads per board or column;
 * deletedAt/expiresAt power trash listing and purging; notes are keyed by itemId.
 */
export class RepoDatabase extends Dexie {
  boards!: Table<Board, string>;
  columns!: Table<Column, string>;
  items!: Table<Item, string>;
  notes!: Table<Note, string>;
  trash!: Table<TrashEntry, string>;
  settings!: Table<SettingRecord, string>;

  constructor(name = "repo-db") {
    super(name);
    this.version(1).stores({
      boards: "id, order, updatedAt",
      columns: "id, boardId, [boardId+order]",
      items: "id, boardId, columnId, [columnId+order], priority, dueDate, updatedAt",
      notes: "itemId",
      trash: "id, boardId, deletedAt, expiresAt",
      settings: "key",
    });
  }
}
