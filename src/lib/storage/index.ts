import { BoardService } from "./BoardService";
import { PreferenceService, type Preferences } from "./PreferenceService";
import { IntegrityChecker, type IntegrityReport } from "./IntegrityChecker";
import { RepoDatabase } from "./RepoDatabase";
import { SeedService } from "./SeedService";
import { SnapshotService } from "./SnapshotService";
import { TrashService } from "./TrashService";
import {
  BoardRepository,
  ColumnRepository,
  ItemRepository,
  NoteRepository,
  SettingsRepository,
  TrashRepository,
} from "./repositories";
import type { Clock } from "./types";

export interface StorageReport {
  /** Preference keys whose stored value was not allowed and was reset to the default. */
  repairedPreferences: string[];
  seeded: boolean;
  purged: number;
  counts: { boards: number; columns: number; items: number; notes: number; trash: number };
  integrity: IntegrityReport;
}

/** Single entry point that wires the database, repositories and services together. */
export class StorageService {
  readonly boards: BoardRepository;
  readonly columns: ColumnRepository;
  readonly items: ItemRepository;
  readonly notes: NoteRepository;
  readonly trash: TrashRepository;
  readonly settings: SettingsRepository;
  readonly preferences: PreferenceService;
  readonly trashService: TrashService;
  readonly boardService: BoardService;
  readonly snapshots: SnapshotService;
  readonly integrity: IntegrityChecker;
  private readonly seeder: SeedService;
  private initPromise: Promise<StorageReport> | null = null;

  constructor(readonly db: RepoDatabase = new RepoDatabase(), clock: Clock = Date.now) {
    this.boards = new BoardRepository(db.boards, clock);
    this.columns = new ColumnRepository(db.columns, clock);
    this.items = new ItemRepository(db.items, clock);
    this.notes = new NoteRepository(db.notes, clock);
    this.trash = new TrashRepository(db.trash, clock);
    this.settings = new SettingsRepository(db.settings, clock);
    this.preferences = new PreferenceService(this.settings);
    this.trashService = new TrashService(db, this, clock, () => this.preferences.retentionMs());
    this.boardService = new BoardService(db, this, clock);
    this.snapshots = new SnapshotService(db);
    this.integrity = new IntegrityChecker(db, clock);
    this.seeder = new SeedService(db, this);
  }

  /** Schema version of the open database. */
  get schemaVersion(): number {
    return this.db.verno;
  }

  /** Re-reads preferences, for example after a restore changed the settings store. */
  reloadPreferences(): Promise<Preferences> {
    return this.preferences.load().then((r) => r.preferences);
  }

  /** Creates the first-run board when no board exists (also needed after restoring an empty backup). */
  ensureSeed(): Promise<boolean> {
    return this.seeder.seedIfEmpty();
  }

  /** Opens the database, purges expired trash, seeds first-run data and verifies integrity. Safe to call repeatedly. */
  init(): Promise<StorageReport> {
    this.initPromise ??= this.runInit();
    return this.initPromise;
  }

  private async runInit(): Promise<StorageReport> {
    await this.db.open();
    const { repaired } = await this.preferences.load();
    const purged = await this.trashService.purgeExpired();
    const seeded = await this.seeder.seedIfEmpty();
    const [boards, columns, items, notes, trash, integrity] = await Promise.all([
      this.boards.count(),
      this.columns.count(),
      this.items.count(),
      this.notes.count(),
      this.trash.count(),
      this.integrity.run(),
    ]);
    return { repairedPreferences: repaired, seeded, purged, counts: { boards, columns, items, notes, trash }, integrity };
  }
}

let shared: StorageService | null = null;

/** Deletes the shared database and forgets the service. Used by tests to start each one from a clean state. */
export async function resetStorage(): Promise<void> {
  if (!shared) return;
  await shared.db.delete();
  shared = null;
}

/** Lazily creates the shared service in the browser (never during server prerender). */
export function getStorage(): StorageService {
  shared ??= new StorageService();
  return shared;
}

export * from "./types";
export * from "./Guard";
export * from "./utils";
export { LocalPrefs } from "./LocalPrefs";
export { DEFAULT_PREFERENCES, NAV_IDS, RETENTION_OPTIONS } from "./PreferenceService";
export type { NavId, Preferences, RetentionDays } from "./PreferenceService";
export type { BoardSnapshot, BoardStats, ItemPatch, StageDeletion } from "./BoardService";
export type { NewItemInput } from "./repositories";
export type { IntegrityReport, IntegrityIssue } from "./IntegrityChecker";
