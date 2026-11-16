import type { RepoDatabase } from "./RepoDatabase";
import type { Clock } from "./types";

export type IntegrityCode = "ORPHAN_COLUMN" | "ORPHAN_ITEM" | "ORPHAN_NOTE" | "DUPLICATE_ORDER" | "DUPLICATE_BOARD_ORDER" | "DUPLICATE_COLUMN_ORDER" | "ITEM_BOARD_MISMATCH" | "EXPIRED_TRASH";

export interface IntegrityIssue {
  code: IntegrityCode;
  id: string;
  message: string;
}

export interface IntegrityReport {
  ok: boolean;
  checkedAt: number;
  issues: IntegrityIssue[];
}

/** Read-only verification of references and ordering across stores. Never modifies data. */
export class IntegrityChecker {
  constructor(private readonly db: RepoDatabase, private readonly clock: Clock) {}

  async run(): Promise<IntegrityReport> {
    const [boards, columns, items, noteIds, trash] = await Promise.all([
      this.db.boards.toArray(),
      this.db.columns.toArray(),
      this.db.items.toArray(),
      this.db.notes.toCollection().primaryKeys(),
      this.db.trash.toArray(),
    ]);
    const now = this.clock();
    const boardIds = new Set(boards.map((b) => b.id));
    const columnIds = new Set(columns.map((c) => c.id));
    const itemIds = new Set(items.map((i) => i.id));
    const issues: IntegrityIssue[] = [];

    for (const c of columns) {
      if (!boardIds.has(c.boardId)) issues.push({ code: "ORPHAN_COLUMN", id: c.id, message: "Column points to a missing board" });
    }
    for (const i of items) {
      if (!boardIds.has(i.boardId) || !columnIds.has(i.columnId)) {
        issues.push({ code: "ORPHAN_ITEM", id: i.id, message: "Item points to a missing board or column" });
      }
    }
    for (const id of noteIds) {
      if (!itemIds.has(id)) issues.push({ code: "ORPHAN_NOTE", id, message: "Note points to a missing item" });
    }
    const boardOrders = new Set<number>();
    for (const b of boards) {
      if (boardOrders.has(b.order)) issues.push({ code: "DUPLICATE_BOARD_ORDER", id: b.id, message: "Two boards share a position" });
      boardOrders.add(b.order);
    }
    const columnOrders = new Map<string, Set<number>>();
    const columnById = new Map(columns.map((c) => [c.id, c]));
    for (const c of columns) {
      const seen = columnOrders.get(c.boardId) ?? new Set<number>();
      if (seen.has(c.order)) issues.push({ code: "DUPLICATE_COLUMN_ORDER", id: c.id, message: "Two stages share a position on one board" });
      seen.add(c.order);
      columnOrders.set(c.boardId, seen);
    }
    for (const i of items) {
      const col = columnById.get(i.columnId);
      if (col && col.boardId !== i.boardId) issues.push({ code: "ITEM_BOARD_MISMATCH", id: i.id, message: "Item's stage belongs to a different board" });
    }
    const ordersByColumn = new Map<string, Set<number>>();
    for (const i of items) {
      const seen = ordersByColumn.get(i.columnId) ?? new Set<number>();
      if (seen.has(i.order)) issues.push({ code: "DUPLICATE_ORDER", id: i.id, message: "Two items share a position in one column" });
      seen.add(i.order);
      ordersByColumn.set(i.columnId, seen);
    }
    for (const t of trash) {
      if (t.expiresAt <= now) issues.push({ code: "EXPIRED_TRASH", id: t.id, message: "Trash entry is past its retention date" });
    }
    return { ok: issues.length === 0, checkedAt: now, issues };
  }
}
