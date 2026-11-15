import type { RepoDatabase } from "./RepoDatabase";
import type { BackupData } from "./types";

/** Consistent whole-database reads and all-or-nothing writes, used by backup, restore and rollback. */
export class SnapshotService {
  constructor(private readonly db: RepoDatabase) {}

  /** Reads every store inside one read transaction so the snapshot is internally consistent. */
  readAll(): Promise<BackupData> {
    const d = this.db;
    return d.transaction("r", [d.boards, d.columns, d.items, d.notes, d.trash, d.settings], async () => ({
      boards: await d.boards.toArray(),
      columns: await d.columns.toArray(),
      items: await d.items.toArray(),
      notes: await d.notes.toArray(),
      trash: await d.trash.toArray(),
      settings: await d.settings.toArray(),
    }));
  }

  /** Replaces all data in one transaction. Any failure aborts the transaction and leaves existing data untouched. */
  replaceAll(data: BackupData): Promise<void> {
    const d = this.db;
    return d.transaction("rw", [d.boards, d.columns, d.items, d.notes, d.trash, d.settings], async () => {
      await Promise.all([d.boards.clear(), d.columns.clear(), d.items.clear(), d.notes.clear(), d.trash.clear(), d.settings.clear()]);
      await d.boards.bulkAdd(data.boards);
      await d.columns.bulkAdd(data.columns);
      await d.items.bulkAdd(data.items);
      await d.notes.bulkAdd(data.notes);
      await d.trash.bulkAdd(data.trash);
      await d.settings.bulkAdd(data.settings);
    });
  }
}
