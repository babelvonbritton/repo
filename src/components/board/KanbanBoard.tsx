"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { useI18n } from "@/i18n";
import type { Column, ColumnTone, Item } from "@/lib/storage";
import { applyMove, itemsOf } from "@/lib/workspace/ordering";
import { Icon } from "../ui/Icon";
import { ItemCardView, SortableItemCard } from "./ItemCard";

const TONE_DOT: Record<ColumnTone, string> = {
  neutral: "bg-sage-200",
  amber: "bg-amber-tone",
  violet: "bg-violet-tone",
  green: "bg-forest-600",
};

interface Props {
  columns: Column[];
  items: Item[];
  dragEnabled: boolean;
  onMove: (id: string, columnId: string, index: number) => void;
  onOpen: (item: Item) => void;
  onAdd: (columnId: string) => void;
}

const COL_PREFIX = "col:";

/** Multi-column board with drag and drop (mouse, touch with press-and-hold, and keyboard). */
export function KanbanBoard({ columns, items, dragEnabled, onMove, onOpen, onAdd }: Props) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }),
  );
  const [draft, setDraft] = useState<Item[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const view = draft ?? items;
  const activeItem = activeId ? view.find((i) => i.id === activeId) ?? null : null;

  const columnOf = (id: string) => (id.startsWith(COL_PREFIX) ? id.slice(COL_PREFIX.length) : view.find((i) => i.id === id)?.columnId);

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setDraft(items);
  }

  /** While dragging over another column, move the placeholder there so the cards make room. */
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    const current = view.find((i) => i.id === id);
    const target = columnOf(overId);
    if (!current || !target || current.columnId === target) return;
    const list = itemsOf(view, target);
    let index = list.length;
    if (!overId.startsWith(COL_PREFIX)) {
      const overIndex = list.findIndex((i) => i.id === overId);
      const below = (active.rect.current.translated?.top ?? 0) > over.rect.top + over.rect.height / 2;
      index = overIndex + (below ? 1 : 0);
    }
    setDraft(applyMove(view, id, target, index));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const id = String(active.id);
    let next = view;
    const current = view.find((i) => i.id === id);
    if (over && current) {
      const overId = String(over.id);
      const column = columnOf(overId);
      if (column === current.columnId && !overId.startsWith(COL_PREFIX) && overId !== id) {
        // Mirror the live preview: drop after the card only when the pointer is
        // below its midpoint, otherwise before it. Read the over card's index
        // from the list without the dragged card, because applyMove removes
        // it first; reading it from the draft list (which already holds the
        // dragged card at the previewed spot) lands one place too far.
        const list = itemsOf(view, column).filter((i) => i.id !== id);
        const overIndex = list.findIndex((i) => i.id === overId);
        if (overIndex >= 0) {
          const below = (active.rect.current.translated?.top ?? 0) > over.rect.top + over.rect.height / 2;
          next = applyMove(view, id, column, overIndex + (below ? 1 : 0));
        }
      }
    }
    const before = items.find((i) => i.id === id);
    const after = next.find((i) => i.id === id);
    setDraft(null);
    setActiveId(null);
    if (over && before && after && (before.columnId !== after.columnId || before.order !== after.order)) {
      onMove(id, after.columnId, after.order);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setDraft(null); setActiveId(null); }}
    >
      <div className="-mx-4 grid grid-cols-1 gap-4 overflow-visible px-4 pb-4 md:mx-0 md:grid-cols-2 md:px-0 xl:grid-cols-4">
        {columns.map((column) => (
          <KanbanColumn key={column.id} column={column} items={dragEnabled ? itemsOf(view, column.id) : view.filter((i) => i.columnId === column.id)} dragEnabled={dragEnabled} calm={activeId !== null} onOpen={onOpen} onAdd={onAdd} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {activeItem ? <ItemCardView item={activeItem} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

interface ColumnProps {
  column: Column;
  items: Item[];
  dragEnabled: boolean;
  calm: boolean;
  onOpen: (item: Item) => void;
  onAdd: (columnId: string) => void;
}

/** One stage of the board: header, droppable card list and an add button. */
function KanbanColumn({ column, items, dragEnabled, calm, onOpen, onAdd }: ColumnProps) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_PREFIX}${column.id}` });
  return (
    <section className="flex w-full min-w-0 flex-col" aria-label={column.name}>
      <header className="mb-3 flex items-center gap-2 border-b border-line pb-3">
        <span className={`size-2 rounded-full ${TONE_DOT[column.tone]}`} />
        <h2 className="text-sm font-medium text-ink">{column.name}</h2>
        <span className="rounded-full bg-sage-100 px-1.5 text-xs tabular-nums text-muted">{items.length}</span>
        <button type="button" onClick={() => onAdd(column.id)} aria-label={t("item.addTo", { stage: column.name })} className="ml-auto grid size-7 place-items-center rounded-full text-muted transition-colors hover:bg-sage-100 hover:text-forest-700">
          <Icon name="plus" size={15} />
        </button>
      </header>
      <div ref={setNodeRef} className={`min-h-24 flex-1 rounded-card transition-colors duration-200 ${isOver ? "bg-sage-50" : ""}`}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <SortableItemCard key={item.id} item={item} disabled={!dragEnabled} calm={calm} onOpen={onOpen} />
            ))}
          </AnimatePresence>
        </SortableContext>
        {items.length === 0 && <div className="grid h-20 place-items-center rounded-card border border-dashed border-line text-xs text-muted">{t("item.emptyColumn")}</div>}
        <button type="button" onClick={() => onAdd(column.id)} className="mt-1 flex w-full items-center gap-1.5 rounded-control px-2 py-2 text-xs text-muted transition-colors hover:bg-sage-50 hover:text-forest-700">
          <Icon name="plus" size={13} />
          {t("item.add")}
        </button>
      </div>
    </section>
  );
}
