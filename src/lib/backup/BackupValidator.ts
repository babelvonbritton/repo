import type { Msg } from "@/i18n/types";
import { AppError } from "@/lib/errors/AppError";
import { countChars } from "@/lib/storage/utils";
import {
  COLUMN_TONES,
  LIMITS,
  PRIORITIES,
  type BackupData,
  type Board,
  type Column,
  type Item,
  type Note,
  type SettingRecord,
  type TrashEntry,
} from "@/lib/storage/types";
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, DATA_NAME, DB_SCHEMA_VERSION, MAX_RECORDS_PER_STORE, STORE_NAMES, type StoreName } from "./constants";
import type { BackupEncryption, BackupKind, BackupManifest } from "./types";

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SEED_RE = /^[a-z0-9-]{1,40}$/;
const SETTING_KEY_RE = /^[A-Za-z0-9._-]{1,64}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const MAX_TIMESTAMP = 4_102_444_800_000; // year 2100

/** Collects problems with their location; only the first few are kept for display. */
class IssueLog {
  readonly lines: string[] = [];
  total = 0;
  add(path: string, message: string): void {
    this.total++;
    if (this.lines.length < 25) this.lines.push(`${path}: ${message}`);
  }
}

/** Reads typed fields from untrusted objects. Problems are logged, never thrown, so all issues are reported at once. */
class FieldReader {
  constructor(private readonly log: IssueLog) {}

  id(o: Raw, key: string, path: string): string {
    const v = o[key];
    if (typeof v === "string" && ID_RE.test(v)) return v;
    this.log.add(`${path}.${key}`, "is not a valid id");
    return "";
  }

  text(o: Raw, key: string, path: string, max: number, opts: { required?: boolean; trim?: boolean } = {}): string {
    const v = o[key];
    if (typeof v !== "string") {
      this.log.add(`${path}.${key}`, "must be text");
      return "";
    }
    if (CONTROL_RE.test(v)) this.log.add(`${path}.${key}`, "contains control characters");
    if (countChars(v) > max) this.log.add(`${path}.${key}`, `is longer than ${max} characters`);
    if (opts.required && v.trim() === "") this.log.add(`${path}.${key}`, "is required");
    return opts.trim ? v.trim() : v;
  }

  seed(o: Raw, key: string, path: string): string | null {
    const v = o[key];
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && SEED_RE.test(v)) return v;
    this.log.add(`${path}.${key}`, "is not a valid key");
    return null;
  }

  int(o: Raw, key: string, path: string, min: number, max: number): number {
    const v = o[key];
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max) return v;
    this.log.add(`${path}.${key}`, `must be a whole number from ${min} to ${max}`);
    return min;
  }

  oneOf<T extends string>(o: Raw, key: string, path: string, options: readonly T[]): T {
    const v = o[key];
    if (typeof v === "string" && (options as readonly string[]).includes(v)) return v as T;
    this.log.add(`${path}.${key}`, "is not an allowed value");
    return options[0];
  }

  date(o: Raw, key: string, path: string): string | null {
    const v = o[key];
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split("-").map(Number);
      const check = new Date(y, m - 1, d);
      if (check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === d) return v;
    }
    this.log.add(`${path}.${key}`, "is not a valid date");
    return null;
  }
}

export interface ValidationResult {
  data: BackupData;
  warnings: Msg[];
  total: number;
}

const FIELDS = {
  board: ["id", "name", "seedKey", "order", "createdAt", "updatedAt"],
  column: ["id", "boardId", "name", "seedKey", "tone", "order", "createdAt", "updatedAt"],
  item: ["id", "boardId", "columnId", "title", "summary", "label", "seedKey", "priority", "dueDate", "order", "createdAt", "updatedAt"],
  note: ["itemId", "text", "updatedAt"],
  trash: ["id", "boardId", "columnId", "item", "note", "deletedAt", "expiresAt"],
  setting: ["key", "value"],
} as const;

/** Validates the contents of data.json: types, limits, references and repairs. Builds clean objects field by field. */
class DataValidation {
  private readonly log = new IssueLog();
  private readonly read = new FieldReader(this.log);
  private unknownFieldRecords = 0;

  constructor(private readonly now: number) {}

  run(raw: unknown): ValidationResult {
    if (!isRecord(raw)) throw this.fail("data.json must be an object");
    const lists = {} as Record<StoreName, unknown[]>;
    for (const name of STORE_NAMES) {
      const v = raw[name];
      if (!Array.isArray(v)) {
        this.log.add(name, "must be a list");
        lists[name] = [];
      } else if (v.length > MAX_RECORDS_PER_STORE) {
        this.log.add(name, `has more than ${MAX_RECORDS_PER_STORE} records`);
        lists[name] = [];
      } else lists[name] = v;
    }

    const boards = this.each(lists.boards, "boards", FIELDS.board, this.board);
    const columns = this.each(lists.columns, "columns", FIELDS.column, this.column);
    const items = this.each(lists.items, "items", FIELDS.item, this.item);
    let notes = this.each(lists.notes, "notes", FIELDS.note, this.note);
    let trash = this.each(lists.trash, "trash", FIELDS.trash, this.trashEntry);
    const settings = this.each(lists.settings, "settings", FIELDS.setting, this.setting);

    this.unique(boards, "boards", (b) => b.id);
    this.unique(columns, "columns", (c) => c.id);
    this.unique(items, "items", (i) => i.id);
    this.unique(notes, "notes", (n) => n.itemId);
    this.unique(trash, "trash", (t) => t.id);
    this.unique(settings, "settings", (s) => s.key);

    const boardIds = new Set(boards.map((b) => b.id));
    const columnById = new Map(columns.map((c) => [c.id, c]));
    const itemIds = new Set(items.map((i) => i.id));
    columns.forEach((c, i) => { if (!boardIds.has(c.boardId)) this.log.add(`columns[${i}].boardId`, "points to a missing board"); });
    items.forEach((it, i) => {
      const col = columnById.get(it.columnId);
      if (!boardIds.has(it.boardId)) this.log.add(`items[${i}].boardId`, "points to a missing board");
      if (!col) this.log.add(`items[${i}].columnId`, "points to a missing stage");
      else if (col.boardId !== it.boardId) this.log.add(`items[${i}].columnId`, "belongs to a different board");
    });
    trash.forEach((t, i) => {
      if (itemIds.has(t.item.id)) this.log.add(`trash[${i}].item.id`, "also exists as a live item");
      if (t.boardId !== t.item.boardId || t.columnId !== t.item.columnId) this.log.add(`trash[${i}]`, "does not match its item snapshot");
      if (t.expiresAt < t.deletedAt) this.log.add(`trash[${i}].expiresAt`, "is before deletedAt");
    });
    if (this.log.total > 0) throw this.fail();

    // Repairs that cannot corrupt data. Each one is reported as a notice.
    const warnings: Msg[] = [];
    const liveNotes = notes.filter((n) => itemIds.has(n.itemId) && n.text.length > 0);
    if (liveNotes.length !== notes.length) warnings.push({ key: "warn.orphanNotes", vars: { count: notes.length - liveNotes.length } });
    notes = liveNotes;

    const keptTrash = trash.filter((t) => t.expiresAt > this.now && boardIds.has(t.boardId));
    const expired = trash.filter((t) => t.expiresAt <= this.now).length;
    const orphaned = trash.length - keptTrash.length - expired;
    if (expired > 0) warnings.push({ key: "warn.expiredTrash", vars: { count: expired } });
    if (orphaned > 0) warnings.push({ key: "warn.orphanTrash", vars: { count: orphaned } });
    trash = keptTrash;

    let renumbered = 0;
    renumbered += this.renumber(boards, () => "");
    renumbered += this.renumber(columns, (c) => c.boardId);
    renumbered += this.renumber(items, (i) => i.columnId);
    if (renumbered > 0) warnings.push({ key: "warn.renumbered", vars: { count: renumbered } });
    if (this.unknownFieldRecords > 0) warnings.push({ key: "warn.unknownFields", vars: { count: this.unknownFieldRecords } });

    const total = boards.length + columns.length + items.length + notes.length + trash.length + settings.length;
    return { data: { boards, columns, items, notes, trash, settings }, warnings, total };
  }

  private fail(summary?: string): AppError {
    const lines = summary ? [summary, ...this.log.lines] : this.log.lines;
    const extra = this.log.total > this.log.lines.length ? `\n...and ${this.log.total - this.log.lines.length} more` : "";
    return new AppError("BACKUP_STRUCTURE_INVALID", { details: lines.join("\n") + extra, context: { issues: this.log.total } });
  }

  private each<T>(list: unknown[], path: string, allowed: readonly string[], build: (o: Raw, path: string) => T): T[] {
    const out: T[] = [];
    list.forEach((entry, i) => {
      const at = `${path}[${i}]`;
      if (!isRecord(entry)) {
        this.log.add(at, "must be an object");
        return;
      }
      if (Object.keys(entry).some((k) => !allowed.includes(k))) this.unknownFieldRecords++;
      out.push(build(entry, at));
    });
    return out;
  }

  private unique<T>(list: T[], path: string, key: (v: T) => string): void {
    const seen = new Set<string>();
    list.forEach((v, i) => {
      const k = key(v);
      if (k && seen.has(k)) this.log.add(`${path}[${i}]`, `duplicate id ${k}`);
      seen.add(k);
    });
  }

  /** Gives every list unique positions 0..n-1 when duplicates exist. Returns how many lists were repaired. */
  private renumber<T extends { order: number; createdAt: number; id: string }>(list: T[], group: (v: T) => string): number {
    const groups = new Map<string, T[]>();
    for (const v of list) groups.set(group(v), [...(groups.get(group(v)) ?? []), v]);
    let repaired = 0;
    for (const members of groups.values()) {
      if (new Set(members.map((m) => m.order)).size === members.length) continue;
      members.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id)).forEach((m, i) => { m.order = i; });
      repaired++;
    }
    return repaired;
  }

  private board = (o: Raw, p: string): Board => ({
    id: this.read.id(o, "id", p),
    name: this.read.text(o, "name", p, LIMITS.boardName, { required: true, trim: true }),
    seedKey: this.read.seed(o, "seedKey", p),
    order: this.read.int(o, "order", p, 0, 1_000_000_000),
    createdAt: this.read.int(o, "createdAt", p, 0, MAX_TIMESTAMP),
    updatedAt: this.read.int(o, "updatedAt", p, 0, MAX_TIMESTAMP),
  });

  private column = (o: Raw, p: string): Column => ({
    id: this.read.id(o, "id", p),
    boardId: this.read.id(o, "boardId", p),
    name: this.read.text(o, "name", p, LIMITS.columnName, { required: true, trim: true }),
    seedKey: this.read.seed(o, "seedKey", p),
    tone: this.read.oneOf(o, "tone", p, COLUMN_TONES),
    order: this.read.int(o, "order", p, 0, 1_000_000_000),
    createdAt: this.read.int(o, "createdAt", p, 0, MAX_TIMESTAMP),
    updatedAt: this.read.int(o, "updatedAt", p, 0, MAX_TIMESTAMP),
  });

  private item = (o: Raw, p: string): Item => ({
    id: this.read.id(o, "id", p),
    boardId: this.read.id(o, "boardId", p),
    columnId: this.read.id(o, "columnId", p),
    title: this.read.text(o, "title", p, LIMITS.itemTitle, { required: true, trim: true }),
    summary: this.read.text(o, "summary", p, LIMITS.itemSummary, { trim: true }),
    label: this.read.text(o, "label", p, LIMITS.itemLabel, { trim: true }),
    seedKey: this.read.seed(o, "seedKey", p),
    priority: this.read.oneOf(o, "priority", p, PRIORITIES),
    dueDate: this.read.date(o, "dueDate", p),
    order: this.read.int(o, "order", p, 0, 1_000_000_000),
    createdAt: this.read.int(o, "createdAt", p, 0, MAX_TIMESTAMP),
    updatedAt: this.read.int(o, "updatedAt", p, 0, MAX_TIMESTAMP),
  });

  private note = (o: Raw, p: string): Note => ({
    itemId: this.read.id(o, "itemId", p),
    text: this.read.text(o, "text", p, LIMITS.note),
    updatedAt: this.read.int(o, "updatedAt", p, 0, MAX_TIMESTAMP),
  });

  private trashEntry = (o: Raw, p: string): TrashEntry => {
    const rawItem = o.item;
    let item: Item;
    if (isRecord(rawItem)) item = this.item(rawItem, `${p}.item`);
    else {
      this.log.add(`${p}.item`, "must be an object");
      item = this.item({}, `${p}.item`);
    }
    const note = o.note;
    if (note !== null && typeof note !== "string") this.log.add(`${p}.note`, "must be text or null");
    else if (typeof note === "string") this.read.text(o, "note", p, LIMITS.note);
    return {
      id: this.read.id(o, "id", p),
      boardId: this.read.id(o, "boardId", p),
      columnId: this.read.id(o, "columnId", p),
      item,
      note: typeof note === "string" ? note : null,
      deletedAt: this.read.int(o, "deletedAt", p, 0, MAX_TIMESTAMP),
      expiresAt: this.read.int(o, "expiresAt", p, 0, MAX_TIMESTAMP),
    };
  };

  private setting = (o: Raw, p: string): SettingRecord => {
    const key = typeof o.key === "string" && SETTING_KEY_RE.test(o.key) ? o.key : "";
    if (!key) this.log.add(`${p}.key`, "is not a valid setting key");
    const v = o.value;
    let value: SettingRecord["value"] = null;
    if (v === null || typeof v === "boolean") value = v;
    else if (typeof v === "number" && Number.isFinite(v)) value = v;
    else if (typeof v === "string" && v.length <= 1000 && !CONTROL_RE.test(v)) value = v;
    else this.log.add(`${p}.value`, "is not an allowed value");
    return { key, value };
  };
}

/** Entry points for validating the two files inside a backup. */
export class BackupValidator {
  /** Checks manifest.json structure and version compatibility. */
  static validateManifest(raw: unknown): BackupManifest {
    if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) {
      throw new AppError("BACKUP_MANIFEST_INVALID", { details: `format must be "${BACKUP_FORMAT}"` });
    }
    const log = new IssueLog();
    const read = new FieldReader(log);
    const formatVersion = read.int(raw, "formatVersion", "manifest", 1, 10_000);
    const schemaVersion = read.int(raw, "schemaVersion", "manifest", 1, 10_000);
    const kind = read.oneOf<BackupKind>(raw, "kind", "manifest", ["backup", "safety"]);
    const createdAtMs = read.int(raw, "createdAtMs", "manifest", 0, MAX_TIMESTAMP);
    const createdAt = read.text(raw, "createdAt", "manifest", 40);
    const app = isRecord(raw.app) ? { name: read.text(raw.app, "name", "manifest.app", 40), version: read.text(raw.app, "version", "manifest.app", 20) } : (log.add("manifest.app", "must be an object"), { name: "", version: "" });

    const stores = {} as BackupManifest["stores"];
    const rawStores = isRecord(raw.stores) ? raw.stores : (log.add("manifest.stores", "must be an object"), {} as Raw);
    for (const name of STORE_NAMES) {
      const s = rawStores[name];
      if (!isRecord(s)) {
        log.add(`manifest.stores.${name}`, "is missing");
        stores[name] = { count: 0, sha256: "" };
        continue;
      }
      const hash = typeof s.sha256 === "string" && HASH_RE.test(s.sha256) ? s.sha256 : (log.add(`manifest.stores.${name}.sha256`, "is not a SHA-256 hash"), "");
      stores[name] = { count: read.int(s, "count", `manifest.stores.${name}`, 0, MAX_RECORDS_PER_STORE), sha256: hash };
    }

    const files: BackupManifest["files"] = [];
    if (Array.isArray(raw.files) && raw.files.length === 1 && isRecord(raw.files[0]) && raw.files[0].name === DATA_NAME) {
      const f = raw.files[0];
      const hash = typeof f.sha256 === "string" && HASH_RE.test(f.sha256) ? f.sha256 : (log.add("manifest.files[0].sha256", "is not a SHA-256 hash"), "");
      files.push({ name: DATA_NAME, bytes: read.int(f, "bytes", "manifest.files[0]", 0, 50 * 1024 * 1024), sha256: hash });
    } else log.add("manifest.files", `must list exactly ${DATA_NAME}`);

    let encryption: BackupEncryption | undefined;
    if ("encryption" in raw) {
      if (!isRecord(raw.encryption)) {
        log.add("manifest.encryption", "must be an object");
      } else {
        const info = raw.encryption;
        if (info.algorithm !== "AES-GCM") log.add("manifest.encryption.algorithm", "is not supported");
        if (info.kdf !== "PBKDF2-SHA-256") log.add("manifest.encryption.kdf", "is not supported");
        const iterations = read.int(info, "iterations", "manifest.encryption", 310_000, 310_000);
        const salt = typeof info.salt === "string" && /^[0-9a-f]{32}$/.test(info.salt) ? info.salt : (log.add("manifest.encryption.salt", "must be 16 bytes of lowercase hex"), "");
        const iv = typeof info.iv === "string" && /^[0-9a-f]{24}$/.test(info.iv) ? info.iv : (log.add("manifest.encryption.iv", "must be 12 bytes of lowercase hex"), "");
        encryption = { algorithm: "AES-GCM", kdf: "PBKDF2-SHA-256", iterations, salt, iv };
      }
    }
    if (formatVersion === BACKUP_FORMAT_VERSION && !encryption) log.add("manifest.encryption", "is required for this format version");
    if (formatVersion < BACKUP_FORMAT_VERSION && encryption) log.add("manifest.encryption", "requires format version 2");

    if (log.total > 0) throw new AppError("BACKUP_MANIFEST_INVALID", { details: log.lines.join("\n") });
    if (formatVersion > BACKUP_FORMAT_VERSION || schemaVersion > DB_SCHEMA_VERSION) {
      throw new AppError("BACKUP_UNSUPPORTED_VERSION", { details: `Backup format ${formatVersion}, schema ${schemaVersion}. This app supports format ${BACKUP_FORMAT_VERSION}, schema ${DB_SCHEMA_VERSION}.` });
    }
    return { format: BACKUP_FORMAT, formatVersion, schemaVersion, kind, app, createdAt, createdAtMs, stores, files, ...(encryption ? { encryption } : {}) };
  }

  /** Validates data.json contents and returns a clean copy plus notices about repairs. */
  static validateData(raw: unknown, now = Date.now()): ValidationResult {
    return new DataValidation(now).run(raw);
  }
}
