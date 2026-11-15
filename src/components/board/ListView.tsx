"use client";

import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "@/i18n";
import type { Column, Item } from "@/lib/storage";
import { formatDate } from "@/lib/workspace/ordering";
import { Icon } from "../ui/Icon";

/** Flat list of items with stage, priority and due date. */
export function ListView({ items, columns, onOpen }: { items: Item[]; columns: Column[]; onOpen: (item: Item) => void }) {
  const { t, locale } = useI18n();
  const stageName = new Map(columns.map((c) => [c.id, c.name]));
  return (
    <ul className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.li key={item.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, overflow: "hidden" }} transition={{ duration: 0.22 }}>
            <button type="button" data-item-id={item.id} onClick={() => onOpen(item)} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-card border border-line bg-surface px-4 py-3 text-left transition-[background-color,border-color,transform] duration-200 hover:border-sage-200 hover:bg-sage-50 active:scale-[0.995] md:grid-cols-[1fr_9rem_6rem_6rem]">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                {item.label && <span className="text-xs text-muted">{item.label}</span>}
              </span>
              <span className="text-xs text-muted md:text-sm">{stageName.get(item.columnId)}</span>
              <span className="text-xs text-muted md:text-sm">{t(`priority.${item.priority}`)}</span>
              <span className="flex items-center gap-1 text-xs text-muted md:text-sm"><Icon name="clock" size={12} />{item.dueDate ? formatDate(item.dueDate, locale) : t("item.noDue")}</span>
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
