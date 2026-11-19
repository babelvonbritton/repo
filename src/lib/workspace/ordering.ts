import type { Column, Item, Priority } from "@/lib/storage";

export type SortMode = "manual" | "priority" | "due" | "newest";

export interface ViewFilters {
  query: string;
  priority: Priority | "all";
  sort: SortMode;
}

export const DEFAULT_FILTERS: ViewFilters = { query: "", priority: "all", sort: "manual" };
const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export const byOrder = (a: Item, b: Item) => a.order - b.order;

/** Items of one column in manual order. */
export function itemsOf(items: Item[], columnId: string): Item[] {
  return items.filter((i) => i.columnId === columnId).sort(byOrder);
}

/** True when any search, filter or non-manual sort is active (drag and drop is paused then). */
export function filtersActive(f: ViewFilters): boolean {
  return f.query.trim() !== "" || f.priority !== "all" || f.sort !== "manual";
}

/**
 * Pure move: places an item at a position in a column and renumbers affected columns.
 * Mirrors BoardService.moveItem so the UI can update instantly before the database write finishes.
 */
export function applyMove(items: Item[], id: string, toColumnId: string, toIndex: number): Item[] {
  const moving = items.find((i) => i.id === id);
  if (!moving) return items;
  const rest = items.filter((i) => i.id !== id);
  const target = itemsOf(rest, toColumnId);
  target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, { ...moving, columnId: toColumnId });
  const next = new Map<string, Item>();
  target.forEach((it, order) => next.set(it.id, { ...it, order }));
  if (moving.columnId !== toColumnId) {
    itemsOf(rest, moving.columnId).forEach((it, order) => next.set(it.id, { ...it, order }));
  }
  return items.map((i) => next.get(i.id) ?? i);
}

/** Search, priority filter and sorting used by both the board and list views. */
export function applyFilters(items: Item[], f: ViewFilters, columns: Column[]): Item[] {
  const q = f.query.trim().toLowerCase();
  const colIndex = new Map(columns.map((c, i) => [c.id, i]));
  const out = items.filter(
    (i) =>
      (f.priority === "all" || i.priority === f.priority) &&
      (q === "" || `${i.title} ${i.summary} ${i.label}`.toLowerCase().includes(q)),
  );
  const manual = (a: Item, b: Item) => (colIndex.get(a.columnId) ?? 0) - (colIndex.get(b.columnId) ?? 0) || a.order - b.order;
  const sorters: Record<string, (a: Item, b: Item) => number> = {
    manual,
    priority: (a, b) => RANK[a.priority] - RANK[b.priority] || manual(a, b),
    due: (a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || manual(a, b),
    newest: (a, b) => b.createdAt - a.createdAt,
  };
  return out.sort(sorters[f.sort]);
}

/** Days left before a trash entry is deleted forever (never below 0). */
export function daysLeft(expiresAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 86_400_000));
}

/** Parses an ISO date (YYYY-MM-DD) without timezone shifts. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Formats an ISO date (YYYY-MM-DD) for the given locale without timezone shifts. */
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(parseDate(iso));
}
