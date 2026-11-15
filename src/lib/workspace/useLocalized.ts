"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import type { Board, Column, Item, TrashEntry } from "@/lib/storage";

/**
 * Shows default boards, stages and sample items in the active language. Anything the user renamed or edited has no
 * seed key any more, so it is shown exactly as they wrote it.
 */
export function useLocalized() {
  const { t, has } = useI18n();
  return useMemo(() => {
    const seeded = (key: string) => has(key);
    const boardName = (b: Pick<Board, "name" | "seedKey">) => (b.seedKey && seeded(`seed.board.${b.seedKey}`) ? t(`seed.board.${b.seedKey}` as MessageKey) : b.name);
    const columnName = (c: Pick<Column, "name" | "seedKey">) => (c.seedKey && seeded(`seed.column.${c.seedKey}`) ? t(`seed.column.${c.seedKey}` as MessageKey) : c.name);
    const item = <T extends Item>(i: T): T =>
      i.seedKey && seeded(`seed.item.${i.seedKey}.title`)
        ? { ...i, title: t(`seed.item.${i.seedKey}.title` as MessageKey), summary: t(`seed.item.${i.seedKey}.summary` as MessageKey), label: t(`seed.item.${i.seedKey}.label` as MessageKey) }
        : i;
    return {
      boardName,
      columnName,
      item,
      boards: (list: Board[]) => list.map((b) => ({ ...b, name: boardName(b) })),
      columns: (list: Column[]) => list.map((c) => ({ ...c, name: columnName(c) })),
      items: (list: Item[]) => list.map(item),
      trash: (list: TrashEntry[]) => list.map((e) => ({ ...e, item: item(e.item) })),
    };
  }, [t, has]);
}
