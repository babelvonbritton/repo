import type { RepoDatabase } from "./RepoDatabase";
import type { BoardRepository, ColumnRepository, ItemRepository } from "./repositories";
import type { ColumnTone, Priority } from "./types";

interface SeedDeps {
  boards: BoardRepository;
  columns: ColumnRepository;
  items: ItemRepository;
}

const COLUMNS: ReadonlyArray<{ key: string; name: string; tone: ColumnTone }> = [
  { key: "not-started", name: "Not started", tone: "neutral" },
  { key: "in-progress", name: "In progress", tone: "amber" },
  { key: "in-review", name: "In review", tone: "violet" },
  { key: "completed", name: "Completed", tone: "green" },
];

const ITEMS: ReadonlyArray<{ key: string; column: string; title: string; summary: string; label: string; priority: Priority }> = [
  { key: "define-goal", column: "not-started", title: "Define your goal", summary: "Decide what you want to organize or accomplish.", label: "General", priority: "high" },
  { key: "gather", column: "in-progress", title: "Gather what you need", summary: "Collect useful information, notes, or materials.", label: "Preparation", priority: "medium" },
  { key: "check", column: "in-review", title: "Check your progress", summary: "Review what has changed and choose your next step.", label: "Review", priority: "medium" },
  { key: "create-space", column: "completed", title: "Create your space", summary: "Your board is ready. Add items for anything you want to track.", label: "General", priority: "low" },
];

/**
 * Creates the first-run "Getting started" board. `seedKey` lets the UI localize untouched defaults, and fixed ids make
 * the same sample on two browsers match when a backup is restored, instead of appearing twice.
 */
export class SeedService {
  constructor(private readonly db: RepoDatabase, private readonly repos: SeedDeps) {}

  /** Seeds only when no board exists. Returns true when seeding happened. */
  seedIfEmpty(): Promise<boolean> {
    const { boards, columns, items } = this.repos;
    return this.db.transaction("rw", [this.db.boards, this.db.columns, this.db.items], async () => {
      if ((await boards.count()) > 0) return false;
      const board = await boards.create("Getting started", "getting-started", "seed-board");
      const columnIds = new Map<string, string>();
      for (const c of COLUMNS) {
        columnIds.set(c.key, (await columns.create(board.id, c.name, c.tone, c.key, `seed-column-${c.key}`)).id);
      }
      for (const i of ITEMS) {
        await items.create({
          id: `seed-item-${i.key}`,
          boardId: board.id,
          columnId: columnIds.get(i.column)!,
          title: i.title,
          summary: i.summary,
          label: i.label,
          priority: i.priority,
          seedKey: i.key,
        });
      }
      return true;
    });
  }
}
