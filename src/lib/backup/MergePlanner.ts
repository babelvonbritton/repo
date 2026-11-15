import { AppError } from "@/lib/errors/AppError";
import type { BackupData, Board, Column, Item, Note, SettingRecord, TrashEntry } from "@/lib/storage/types";
import { BackupValidator } from "./BackupValidator";

export type Decision = "replace" | "skip";
export type EntityKind = "board" | "column" | "item" | "note" | "trash" | "setting";
export type EntryStatus = "new" | "same" | "differs";
export type DiffField = "name" | "tone" | "title" | "summary" | "label" | "priority" | "dueDate" | "stage" | "board" | "note" | "value" | "location";

/** A value shown in a comparison. The UI decides how to format each kind in the active language. */
export type DiffValue =
  | { kind: "text"; value: string }
  | { kind: "name"; value: string; seedKey: string | null; seed: "board" | "column" }
  | { kind: "priority"; value: string }
  | { kind: "tone"; value: string }
  | { kind: "date"; value: string }
  | { kind: "long"; value: string }
  | { kind: "place"; value: "trash" | "board" };

export interface FieldDiff {
  field: DiffField;
  current: DiffValue;
  incoming: DiffValue;
}

/** What to call a record in the review; `seed` lets default names appear in the active language. */
export interface DisplayName {
  text: string;
  seedKey: string | null;
  seed: "board" | "column" | "item" | null;
}

export interface MergeEntry {
  key: string;
  kind: EntityKind;
  id: string;
  status: EntryStatus;
  name: DisplayName;
  diffs: FieldDiff[];
  /** Set when the same item is in the trash on one side and on the board on the other. */
  hint?: "trashedNow" | "liveNow";
}

export interface MergeCounts {
  new: number;
  same: number;
  differs: number;
}

export interface MergePlan {
  entries: MergeEntry[];
  byKind: Record<EntityKind, MergeCounts>;
  totals: MergeCounts;
}

export interface MergeResult {
  data: BackupData;
  warnings: ReturnType<typeof BackupValidator.validateData>["warnings"];
  added: number;
  replaced: number;
  kept: number;
  unchanged: number;
  total: number;
}

/** Working copy of the database while decisions are applied. */
interface Working {
  boards: Map<string, Board>;
  columns: Map<string, Column>;
  items: Map<string, Item>;
  notes: Map<string, Note>;
  /** Trash entries keyed by the id of the item they hold (an item can be in the trash only once). */
  trash: Map<string, TrashEntry>;
  settings: Map<string, SettingRecord>;
  maxOrder: { boards: Map<string, number>; columns: Map<string, number>; items: Map<string, number> };
}

interface Candidate {
  entry: MergeEntry;
  add?: (w: Working) => void;
  replace?: (w: Working) => void;
}

const KINDS: EntityKind[] = ["board", "column", "item", "note", "trash", "setting"];
const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

const text = (value: string): DiffValue => ({ kind: "text", value });

/**
 * Compares a backup with the current data, record by record, using ids as identity:
 * records that do not exist are new, records with identical content are left alone, and records that exist with
 * different content are listed with their differences so the user decides to replace or keep each one.
 */
export class MergePlanner {
  static plan(current: BackupData, incoming: BackupData): MergePlan {
    const entries = MergePlanner.classify(current, incoming).map((c) => c.entry);
    const empty = (): MergeCounts => ({ new: 0, same: 0, differs: 0 });
    const byKind = Object.fromEntries(KINDS.map((k) => [k, empty()])) as Record<EntityKind, MergeCounts>;
    const totals = empty();
    for (const e of entries) {
      byKind[e.kind][e.status]++;
      totals[e.status]++;
    }
    return { entries, byKind, totals };
  }

  /**
   * Builds the data that results from the user's decisions: new records are added, records marked "replace" are
   * overwritten, everything else stays. Unlisted conflicts default to keeping the current data. The result is
   * validated like any backup, so a combination that would break references is refused.
   */
  static resolve(current: BackupData, incoming: BackupData, decisions: ReadonlyMap<string, Decision>, now = Date.now()): MergeResult {
    const w = MergePlanner.working(current);
    let added = 0;
    let replaced = 0;
    let kept = 0;
    let unchanged = 0;
    for (const c of MergePlanner.classify(current, incoming)) {
      if (c.entry.status === "new") {
        c.add?.(w);
        added++;
      } else if (c.entry.status === "same") unchanged++;
      else if (decisions.get(c.entry.key) === "replace") {
        c.replace?.(w);
        replaced++;
      } else kept++;
    }
    const merged: BackupData = {
      boards: [...w.boards.values()],
      columns: [...w.columns.values()],
      items: [...w.items.values()],
      notes: [...w.notes.values()],
      trash: [...w.trash.values()],
      settings: [...w.settings.values()],
    };
    try {
      const checked = BackupValidator.validateData(merged, now);
      return { data: checked.data, warnings: checked.warnings, added, replaced, kept, unchanged, total: checked.total };
    } catch (e) {
      if (e instanceof AppError && e.code === "BACKUP_STRUCTURE_INVALID") throw new AppError("BACKUP_MERGE_INVALID", { cause: e, details: e.details });
      throw e;
    }
  }

  // ------------------------------------------------------------------ internals

  private static working(current: BackupData): Working {
    const max = <T extends { order: number }>(list: T[], group: (v: T) => string) => {
      const m = new Map<string, number>();
      for (const v of list) m.set(group(v), Math.max(m.get(group(v)) ?? -1, v.order));
      return m;
    };
    return {
      boards: new Map(current.boards.map((b) => [b.id, { ...b }])),
      columns: new Map(current.columns.map((c) => [c.id, { ...c }])),
      items: new Map(current.items.map((i) => [i.id, { ...i }])),
      notes: new Map(current.notes.map((n) => [n.itemId, { ...n }])),
      trash: new Map(current.trash.map((t) => [t.item.id, { ...t }])),
      settings: new Map(current.settings.map((s) => [s.key, { ...s }])),
      maxOrder: { boards: max(current.boards, () => ""), columns: max(current.columns, (c) => c.boardId), items: max(current.items, (i) => i.columnId) },
    };
  }

  /** A record joining a group that already has members goes to the end; a brand-new group keeps its own order. */
  private static place(w: Working, kind: keyof Working["maxOrder"], group: string, own: number): number {
    const map = w.maxOrder[kind];
    const order = map.has(group) ? (map.get(group) as number) + 1 : own;
    map.set(group, order);
    return order;
  }

  private static classify(current: BackupData, incoming: BackupData): Candidate[] {
    const curBoards = new Map(current.boards.map((b) => [b.id, b]));
    const curColumns = new Map(current.columns.map((c) => [c.id, c]));
    const curItems = new Map(current.items.map((i) => [i.id, i]));
    const curNotes = new Map(current.notes.map((n) => [n.itemId, n]));
    const curTrash = new Map(current.trash.map((t) => [t.item.id, t]));
    const curSettings = new Map(current.settings.map((s) => [s.key, s]));
    const incBoards = new Map(incoming.boards.map((b) => [b.id, b]));
    const incColumns = new Map(incoming.columns.map((c) => [c.id, c]));
    const incItems = new Map(incoming.items.map((i) => [i.id, i]));

    const boardRef = (b?: Board): DiffValue => (b ? { kind: "name", value: b.name, seedKey: b.seedKey, seed: "board" } : text(""));
    const columnRef = (c?: Column): DiffValue => (c ? { kind: "name", value: c.name, seedKey: c.seedKey, seed: "column" } : text(""));
    const itemName = (i: { title: string; seedKey: string | null }): DisplayName => ({ text: i.title, seedKey: i.seedKey, seed: "item" });
    const diff = (field: DiffField, a: string, b: string, kind: "text" | "priority" | "date" | "long" = "text"): FieldDiff[] =>
      a === b ? [] : [{ field, current: { kind, value: a } as DiffValue, incoming: { kind, value: b } as DiffValue }];

    /** Differences between the visible content of two item snapshots. */
    const itemDiffs = (cur: Item, inc: Item, curCol: Column | undefined, incCol: Column | undefined, curBoard: Board | undefined, incBoard: Board | undefined): FieldDiff[] => [
      ...diff("title", cur.title, inc.title),
      ...diff("summary", cur.summary, inc.summary),
      ...diff("label", cur.label, inc.label),
      ...diff("priority", cur.priority, inc.priority, "priority"),
      ...diff("dueDate", cur.dueDate ?? "", inc.dueDate ?? "", "date"),
      ...(cur.columnId !== inc.columnId ? [{ field: "stage" as const, current: columnRef(curCol), incoming: columnRef(incCol) }] : []),
      ...(cur.boardId !== inc.boardId ? [{ field: "board" as const, current: boardRef(curBoard), incoming: boardRef(incBoard) }] : []),
    ];

    const entry = (kind: EntityKind, id: string, status: EntryStatus, name: DisplayName, diffs: FieldDiff[], hint?: MergeEntry["hint"]): MergeEntry => ({ key: `${kind}:${id}`, kind, id, status, name, diffs, hint });
    const out: Candidate[] = [];

    for (const inc of [...incoming.boards].sort(byOrder)) {
      const cur = curBoards.get(inc.id);
      const name: DisplayName = { text: inc.name, seedKey: inc.seedKey, seed: "board" };
      if (!cur) out.push({ entry: entry("board", inc.id, "new", name, []), add: (w) => void w.boards.set(inc.id, { ...inc, order: MergePlanner.place(w, "boards", "", inc.order) }) });
      else {
        const diffs = diff("name", cur.name, inc.name);
        out.push({ entry: entry("board", inc.id, diffs.length ? "differs" : "same", name, diffs), replace: (w) => void w.boards.set(inc.id, { ...inc, order: cur.order }) });
      }
    }

    for (const inc of [...incoming.columns].sort(byOrder)) {
      const cur = curColumns.get(inc.id);
      const name: DisplayName = { text: inc.name, seedKey: inc.seedKey, seed: "column" };
      if (!cur) out.push({ entry: entry("column", inc.id, "new", name, []), add: (w) => void w.columns.set(inc.id, { ...inc, order: MergePlanner.place(w, "columns", inc.boardId, inc.order) }) });
      else {
        const diffs = [
          ...diff("name", cur.name, inc.name),
          ...diff("tone", cur.tone, inc.tone),
          ...(cur.boardId !== inc.boardId ? [{ field: "board" as const, current: boardRef(curBoards.get(cur.boardId)), incoming: boardRef(incBoards.get(inc.boardId)) }] : []),
        ];
        out.push({
          entry: entry("column", inc.id, diffs.length ? "differs" : "same", name, diffs),
          replace: (w) => void w.columns.set(inc.id, { ...inc, order: cur.boardId === inc.boardId ? cur.order : MergePlanner.place(w, "columns", inc.boardId, inc.order) }),
        });
      }
    }

    for (const inc of [...incoming.items].sort(byOrder)) {
      const cur = curItems.get(inc.id);
      const inTrash = curTrash.get(inc.id);
      const incCol = incColumns.get(inc.columnId);
      if (cur) {
        const diffs = itemDiffs(cur, inc, curColumns.get(cur.columnId), incCol, curBoards.get(cur.boardId), incBoards.get(inc.boardId));
        out.push({
          entry: entry("item", inc.id, diffs.length ? "differs" : "same", itemName(inc), diffs),
          replace: (w) => void w.items.set(inc.id, { ...inc, order: cur.columnId === inc.columnId ? cur.order : MergePlanner.place(w, "items", inc.columnId, inc.order) }),
        });
      } else if (inTrash) {
        const diffs: FieldDiff[] = [
          { field: "location", current: { kind: "place", value: "trash" }, incoming: { kind: "place", value: "board" } },
          ...itemDiffs(inTrash.item, inc, curColumns.get(inTrash.item.columnId), incCol, curBoards.get(inTrash.item.boardId), incBoards.get(inc.boardId)),
        ];
        out.push({
          entry: entry("item", inc.id, "differs", itemName(inc), diffs, "trashedNow"),
          replace: (w) => {
            w.trash.delete(inc.id);
            w.items.set(inc.id, { ...inc, order: MergePlanner.place(w, "items", inc.columnId, inc.order) });
          },
        });
      } else {
        out.push({ entry: entry("item", inc.id, "new", itemName(inc), []), add: (w) => void w.items.set(inc.id, { ...inc, order: MergePlanner.place(w, "items", inc.columnId, inc.order) }) });
      }
    }

    for (const inc of incoming.notes) {
      const cur = curNotes.get(inc.itemId);
      const owner = incItems.get(inc.itemId) ?? curItems.get(inc.itemId) ?? curTrash.get(inc.itemId)?.item;
      const name: DisplayName = owner ? itemName(owner) : { text: inc.itemId, seedKey: null, seed: null };
      if (!cur) out.push({ entry: entry("note", inc.itemId, "new", name, []), add: (w) => void w.notes.set(inc.itemId, { ...inc }) });
      else {
        const diffs = diff("note", cur.text, inc.text, "long");
        out.push({ entry: entry("note", inc.itemId, diffs.length ? "differs" : "same", name, diffs), replace: (w) => void w.notes.set(inc.itemId, { ...inc }) });
      }
    }

    for (const inc of [...incoming.trash].sort((a, b) => a.deletedAt - b.deletedAt)) {
      const id = inc.item.id;
      const inTrash = curTrash.get(id);
      const live = curItems.get(id);
      const name = itemName(inc.item);
      const incCol = incColumns.get(inc.item.columnId);
      if (inTrash) {
        const diffs = [...itemDiffs(inTrash.item, inc.item, curColumns.get(inTrash.item.columnId), incCol, curBoards.get(inTrash.item.boardId), incBoards.get(inc.item.boardId)), ...diff("note", inTrash.note ?? "", inc.note ?? "", "long")];
        out.push({
          entry: entry("trash", id, diffs.length ? "differs" : "same", name, diffs),
          // keep the current deletion time and expiry; only the content comes from the backup
          replace: (w) => void w.trash.set(id, { ...inTrash, boardId: inc.boardId, columnId: inc.columnId, item: inc.item, note: inc.note }),
        });
      } else if (live) {
        const diffs: FieldDiff[] = [
          { field: "location", current: { kind: "place", value: "board" }, incoming: { kind: "place", value: "trash" } },
          ...itemDiffs(live, inc.item, curColumns.get(live.columnId), incCol, curBoards.get(live.boardId), incBoards.get(inc.item.boardId)),
        ];
        out.push({
          entry: entry("trash", id, "differs", name, diffs, "liveNow"),
          replace: (w) => {
            w.items.delete(id);
            w.notes.delete(id);
            w.trash.set(id, { ...inc });
          },
        });
      } else out.push({ entry: entry("trash", id, "new", name, []), add: (w) => void w.trash.set(id, { ...inc }) });
    }

    for (const inc of incoming.settings) {
      const cur = curSettings.get(inc.key);
      const name: DisplayName = { text: inc.key, seedKey: null, seed: null };
      if (!cur) out.push({ entry: entry("setting", inc.key, "new", name, []), add: (w) => void w.settings.set(inc.key, { ...inc }) });
      else {
        const diffs = diff("value", String(cur.value), String(inc.value));
        out.push({ entry: entry("setting", inc.key, diffs.length ? "differs" : "same", name, diffs), replace: (w) => void w.settings.set(inc.key, { ...inc }) });
      }
    }
    return out;
  }
}
