import { AppError } from "@/lib/errors/AppError";
import { LIMITS, LocalPrefs, type ColumnTone, type Preferences, type RetentionDays, type StageDeletion, type BoardStats, type IntegrityReport, type Board, type BoardSnapshot, type Item, type ItemPatch, type NewItemInput, type StorageService, type TrashEntry } from "@/lib/storage";

/** Single gateway between the UI and storage: the UI never touches repositories directly. */
export class WorkspaceController {
  constructor(private readonly storage: StorageService) {}

  /** Opens storage and picks the board to show (last used board when it still exists). */
  async boot(): Promise<{ boards: Board[]; activeId: string; trash: TrashEntry[]; preferences: Preferences; integrity: IntegrityReport; repairedPreferences: string[] }> {
    const report = await this.storage.init();
    return { ...(await this.load()), integrity: report.integrity, repairedPreferences: report.repairedPreferences };
  }

  /** Reads boards, the board to show, the trash and preferences. Also used after a restore. */
  async load(): Promise<{ boards: Board[]; activeId: string; trash: TrashEntry[]; preferences: Preferences }> {
    await this.storage.ensureSeed();
    const preferences = await this.storage.reloadPreferences();
    const boards = await this.storage.boardService.listBoards();
    const saved = LocalPrefs.get("board");
    const activeId = boards.find((b) => b.id === saved)?.id ?? boards[0].id;
    return { boards, activeId, trash: await this.listTrash(), preferences };
  }

  loadBoard(id: string): Promise<BoardSnapshot | null> {
    LocalPrefs.set("board", id);
    return this.storage.boardService.loadBoard(id);
  }

  async createBoard(name: string): Promise<Board> {
    if ((await this.storage.boards.count()) >= LIMITS.boards) {
      throw new AppError("LIMIT_REACHED", { severity: "warning", context: { what: "boards", max: LIMITS.boards } });
    }
    return this.storage.boardService.createBoard(name);
  }

  /** Creates an item and, when given, its note. */
  async createItem(input: NewItemInput, note: string): Promise<Item> {
    const item = await this.storage.items.create(input);
    if (note) await this.storage.notes.save(item.id, note);
    return item;
  }

  /** Saves item fields and note, and moves the item to the end of another column when the stage changed. */
  async saveItem(id: string, patch: ItemPatch, note: string, columnId: string): Promise<void> {
    const current = await this.storage.items.get(id);
    if (!current) return;
    await this.storage.boardService.updateItem(id, patch);
    await this.storage.notes.save(id, note);
    if (current.columnId !== columnId) {
      const end = (await this.storage.items.listByColumn(columnId)).length;
      await this.storage.boardService.moveItem(id, columnId, end);
    }
  }

  async loadNote(itemId: string): Promise<string> {
    return (await this.storage.notes.get(itemId))?.text ?? "";
  }

  moveItem(id: string, columnId: string, index: number): Promise<void> {
    return this.storage.boardService.moveItem(id, columnId, index);
  }

  trashItem(id: string): Promise<TrashEntry | null> {
    return this.storage.trashService.trashItem(id);
  }

  listTrash(): Promise<TrashEntry[]> {
    return this.storage.trash.listNewestFirst();
  }

  restore(entryId: string): Promise<Item | null> {
    return this.storage.trashService.restore(entryId);
  }

  deleteForever(entryId: string): Promise<void> {
    return this.storage.trashService.deleteForever(entryId);
  }

  async emptyTrash(): Promise<void> {
    for (const entry of await this.storage.trash.all()) await this.storage.trashService.deleteForever(entry.id);
  }

  purgeExpired(): Promise<number> {
    return this.storage.trashService.purgeExpired();
  }

  // ------------------------------------------------------------ boards and stages

  renameBoard(id: string, name: string): Promise<Board | null> {
    return this.storage.boardService.renameBoard(id, name);
  }

  boardStats(id: string): Promise<BoardStats> {
    return this.storage.boardService.boardStats(id);
  }

  deleteBoard(id: string): Promise<void> {
    return this.storage.boardService.deleteBoard(id);
  }

  createStage(boardId: string, name: string, tone: ColumnTone) {
    return this.storage.boardService.createColumn(boardId, name, tone);
  }

  updateStage(id: string, patch: { name?: string; tone?: ColumnTone }) {
    return this.storage.boardService.updateColumn(id, patch);
  }

  moveStage(id: string, index: number): Promise<void> {
    return this.storage.boardService.moveColumn(id, index);
  }

  deleteStage(id: string, strategy: StageDeletion): Promise<void> {
    return this.storage.boardService.deleteColumn(id, strategy);
  }

  // ------------------------------------------------------------ preferences

  setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): Promise<Preferences> {
    return this.storage.preferences.set(key, value);
  }

  /** How many trashed items a new keep-time would delete immediately. */
  retentionImpact(days: RetentionDays): Promise<number> {
    return this.storage.trashService.countExpiredWith(days === 0 ? Infinity : days * 86_400_000);
  }

  /** Saves the keep-time, applies it to items already in the trash, and returns how many were deleted. */
  async setRetention(days: RetentionDays): Promise<number> {
    await this.storage.preferences.set("trashRetentionDays", days);
    return (await this.storage.trashService.reschedule()).purged;
  }

  get schemaVersion(): number {
    return this.storage.schemaVersion;
  }
}
