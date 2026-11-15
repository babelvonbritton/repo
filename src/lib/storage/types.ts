/** Shared domain types and limits for the Repo storage layer. */

export const LIMITS = {
  boardName: 60,
  columnName: 60,
  itemTitle: 120,
  itemSummary: 500,
  itemLabel: 40,
  note: 4000,
  stagesPerBoard: 12,
  boards: 50,
} as const;

export const NOTE_MAX_LENGTH = LIMITS.note;
export const TRASH_RETENTION_DAYS = 7;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
/** `expiresAt` value meaning "never deleted automatically" (the year 2100, the latest date backups accept). */
export const TRASH_NEVER = 4_102_444_800_000;

export const PRIORITIES = ["low", "medium", "high"] as const;
export const COLUMN_TONES = ["neutral", "amber", "violet", "green"] as const;

export type Priority = (typeof PRIORITIES)[number];
export type ColumnTone = (typeof COLUMN_TONES)[number];

/** A workspace board. `seedKey` marks default content so it can be localized until renamed. */
export interface Board {
  id: string;
  name: string;
  seedKey: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** A stage inside a board (for example "In progress"). */
export interface Column {
  id: string;
  boardId: string;
  name: string;
  seedKey: string | null;
  tone: ColumnTone;
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** A task or any trackable item. Its long note lives in the separate notes store. */
export interface Item {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  summary: string;
  label: string;
  seedKey: string | null;
  priority: Priority;
  dueDate: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** Long-form note for one item (max 4000 characters), loaded only when needed. */
export interface Note {
  itemId: string;
  text: string;
  updatedAt: number;
}

/** A deleted item snapshot kept until `expiresAt`. */
export interface TrashEntry {
  id: string;
  boardId: string;
  columnId: string;
  item: Item;
  note: string | null;
  deletedAt: number;
  expiresAt: number;
}

export interface SettingRecord {
  key: string;
  value: string | number | boolean | null;
}

export type Clock = () => number;

/** Every record of every store: the unit used by backup, restore and rollback. */
export interface BackupData {
  boards: Board[];
  columns: Column[];
  items: Item[];
  notes: Note[];
  trash: TrashEntry[];
  settings: SettingRecord[];
}
