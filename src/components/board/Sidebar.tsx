"use client";

import { motion } from "motion/react";
import { useI18n } from "@/i18n";
import type { Board, NavId } from "@/lib/storage";
import { Logo } from "../Logo";
import { Icon } from "../ui/Icon";
import type { NavEntry } from "./MobileNav";

interface Props {
  items: NavEntry[];
  activeId: NavId;
  boards: Board[];
  boardId: string | null;
  onSelectBoard: (id: string) => void;
  onNewBoard: () => void;
}

/** Desktop navigation. The order of the menu comes from the user's setting. */
export function Sidebar({ items, activeId, boards, boardId, onSelectBoard, onNewBoard }: Props) {
  const { t } = useI18n();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-surface px-4 py-6 md:flex">
      <Logo className="px-2" small />
      <nav className="flex flex-col gap-1" aria-label={t("nav.workspace")}>
        {items.map((n) => {
          const active = n.id === activeId;
          return (
            <button key={n.id} type="button" onClick={n.onClick} aria-current={active ? "page" : undefined} className={`relative flex h-10 items-center gap-3 rounded-control px-3 text-sm transition-colors duration-200 ${active ? "font-medium text-forest-900" : "text-muted hover:bg-sage-50 hover:text-ink"}`}>
              {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-control bg-sage-100" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <Icon name={n.icon} size={17} className="relative" />
              <span className="relative">{n.label}</span>
              {n.count ? <span className="relative ml-auto text-xs tabular-nums text-muted">{n.count}</span> : null}
            </button>
          );
        })}
      </nav>
      <div className="flex min-h-0 flex-col gap-1">
        <div className="mb-1 flex items-center justify-between px-3 text-xs text-muted">
          <span>{t("nav.boards")}</span>
          <button type="button" onClick={onNewBoard} aria-label={t("nav.newBoard")} className="grid size-6 place-items-center rounded-full transition-colors hover:bg-sage-100 hover:text-forest-700">
            <Icon name="plus" size={14} />
          </button>
        </div>
        <div className="flex flex-col gap-0.5 overflow-y-auto">
          {boards.map((b) => (
            <button key={b.id} type="button" onClick={() => onSelectBoard(b.id)} className={`flex h-9 items-center gap-2.5 truncate rounded-control px-3 text-left text-sm transition-colors duration-200 ${b.id === boardId ? "bg-sage-50 font-medium text-forest-900" : "text-muted hover:bg-sage-50 hover:text-ink"}`}>
              <span className={`size-1.5 shrink-0 rounded-full transition-colors ${b.id === boardId ? "bg-forest-600" : "bg-sage-200"}`} />
              <span className="truncate">{b.name}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onNewBoard} className="mt-1 flex h-9 items-center gap-2.5 rounded-control px-3 text-sm text-muted transition-colors hover:bg-sage-50 hover:text-forest-700">
          <Icon name="plus" size={14} />
          {t("nav.newBoard")}
        </button>
      </div>
      <p className="mt-auto px-3 text-xs text-muted">{t("nav.localData")}</p>
    </aside>
  );
}
