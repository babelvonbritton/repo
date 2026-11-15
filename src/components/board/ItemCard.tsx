"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import type { KeyboardEvent } from "react";
import { useI18n } from "@/i18n";
import type { Item, Priority } from "@/lib/storage";
import { formatDate } from "@/lib/workspace/ordering";
import { Icon } from "../ui/Icon";

/** Three small bars that fill with priority. */
function PriorityBars({ level }: { level: Priority }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="flex items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`w-[3px] rounded-full ${i < filled ? "bg-forest-600" : "bg-sage-200"}`} style={{ height: 5 + i * 3 }} />
      ))}
    </span>
  );
}

/** Visual card, reused by the board, the drag overlay and tests. */
export function ItemCardView({ item, dragging = false }: { item: Item; dragging?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <div
      data-item-id={item.id}
      className={`rounded-card border border-line bg-surface p-3.5 transition-[box-shadow,border-color] duration-200 ${dragging ? "rotate-[1.5deg] border-sage-200 shadow-[0_24px_44px_-18px_rgba(28,47,38,0.45)]" : "hover:border-sage-200 hover:shadow-[0_10px_24px_-16px_rgba(28,47,38,0.35)]"}`}
    >
      <div className="flex items-start justify-between gap-2">
        {item.label ? <span className="rounded-md bg-sage-100 px-1.5 py-0.5 text-[11px] text-forest-700">{item.label}</span> : <span />}
        <Icon name="grip" size={16} strokeWidth={2.4} className="text-sage-200" />
      </div>
      <h3 className="mt-2 text-sm font-medium text-ink">{item.title}</h3>
      {item.summary && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{item.summary}</p>}
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-1.5"><PriorityBars level={item.priority} />{t(`priority.${item.priority}`)}</span>
        <span className="flex items-center gap-1">
          <Icon name="clock" size={12} />
          {item.dueDate ? formatDate(item.dueDate, locale) : t("item.noDue")}
        </span>
      </div>
    </div>
  );
}

interface Props {
  item: Item;
  disabled: boolean;
  /** True while any card is being dragged: skip enter/exit animation so moving between columns stays calm. */
  calm: boolean;
  onOpen: (item: Item) => void;
}

/** Draggable, keyboard-accessible card. The inner motion element handles enter and exit. */
export function SortableItemCard({ item, disabled, calm, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled });

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    listeners?.onKeyDown?.(e);
    if (e.key === "Enter" && !isDragging) onOpen(item);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, touchAction: disabled ? "auto" : "manipulation" }}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={() => onOpen(item)}
      className={`cursor-pointer outline-none transition-opacity duration-150 focus-visible:[&>div]:ring-2 focus-visible:[&>div]:ring-forest-600 ${isDragging ? "opacity-30" : ""}`}
    >
      <motion.div
        initial={calm ? false : { opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={calm ? undefined : { opacity: 0, height: 0, marginBottom: 0, scale: 0.96, overflow: "hidden", transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="pb-3"
      >
        <ItemCardView item={item} />
      </motion.div>
    </div>
  );
}
