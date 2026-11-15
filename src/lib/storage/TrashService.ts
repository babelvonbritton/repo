import type { RepoDatabase } from "./RepoDatabase";
import type { ColumnRepository, ItemRepository, NoteRepository, TrashRepository } from "./repositories";
import { createId } from "./utils";
import { TRASH_NEVER, TRASH_RETENTION_MS, type Clock, type Item, type TrashEntry } from "./types";

interface TrashDeps {
  items: ItemRepository;
  notes: NoteRepository;
  columns: ColumnRepository;
  trash: TrashRepository;
}

/** Moves items to and from the trash atomically, and enforces the 7-day retention. */
export class TrashService {
  /** `retention` returns the keep-time in milliseconds, or Infinity to keep items until the user deletes them. */
  constructor(
    private readonly db: RepoDatabase,
    private readonly repos: TrashDeps,
    private readonly clock: Clock,
    private readonly retention: () => number = () => TRASH_RETENTION_MS,
  ) {}

  private expiryFor(deletedAt: number, ms: number): number {
    return Number.isFinite(ms) ? Math.min(deletedAt + ms, TRASH_NEVER - 1) : TRASH_NEVER;
  }

  /** Snapshots an item and its note into the trash, then removes them from the live stores. */
  trashItem(itemId: string): Promise<TrashEntry | null> {
    const { items, notes, trash } = this.repos;
    return this.db.transaction("rw", [this.db.items, this.db.notes, this.db.trash], async () => {
      const item = await items.get(itemId);
      if (!item) return null;
      const note = await notes.get(itemId);
      const now = this.clock();
      const entry: TrashEntry = {
        id: createId(),
        boardId: item.boardId,
        columnId: item.columnId,
        item,
        note: note?.text ?? null,
        deletedAt: now,
        expiresAt: this.expiryFor(now, this.retention()),
      };
      await trash.put(entry);
      await items.remove(itemId);
      await notes.remove(itemId);
      return entry;
    });
  }

  /**
   * Restores an entry to its original column, or the board's first column if that column is gone.
   * Returns null when the board has no columns left.
   */
  restore(entryId: string): Promise<Item | null> {
    const { items, notes, columns, trash } = this.repos;
    return this.db.transaction("rw", [this.db.items, this.db.notes, this.db.columns, this.db.trash], async () => {
      const entry = await trash.get(entryId);
      if (!entry) return null;
      const boardColumns = await columns.listByBoard(entry.boardId);
      const target = boardColumns.find((c) => c.id === entry.columnId) ?? boardColumns[0];
      if (!target) return null;
      const now = this.clock();
      const restored: Item = { ...entry.item, columnId: target.id, order: await items.nextOrder(target.id), updatedAt: now };
      await items.put(restored);
      if (entry.note) await notes.put({ itemId: restored.id, text: entry.note, updatedAt: now });
      await trash.remove(entryId);
      return restored;
    });
  }

  /** How many entries would be deleted right now if items were kept for `ms` milliseconds. */
  async countExpiredWith(ms: number): Promise<number> {
    const now = this.clock();
    return (await this.repos.trash.all()).filter((e) => this.expiryFor(e.deletedAt, ms) <= now).length;
  }

  /** Recalculates every entry's expiry from the current retention setting, then deletes the ones now past it. */
  async reschedule(): Promise<{ purged: number }> {
    const ms = this.retention();
    const all = await this.repos.trash.all();
    await this.db.trash.bulkPut(all.map((e) => ({ ...e, expiresAt: this.expiryFor(e.deletedAt, ms) })));
    return { purged: await this.purgeExpired() };
  }

  /** Permanently deletes one trash entry. */
  deleteForever(entryId: string): Promise<void> {
    return this.repos.trash.remove(entryId);
  }

  /** Permanently deletes every entry older than the retention period. */
  purgeExpired(): Promise<number> {
    return this.repos.trash.purgeExpired(this.clock());
  }
}
