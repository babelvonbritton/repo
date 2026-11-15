"use client";

import { motion } from "motion/react";
import { useI18n } from "@/i18n";
import type { Priority } from "@/lib/storage";
import type { SortMode, ViewFilters } from "@/lib/workspace/ordering";
import { Icon } from "../ui/Icon";
import { SearchField } from "../ui/SearchField";
import { Select } from "../ui/Select";
import type { ViewMode } from "./types";

interface Props {
  view: ViewMode;
  onView: (view: ViewMode) => void;
  filters: ViewFilters;
  onFilters: (filters: ViewFilters) => void;
}

/** View switch, search, priority filter and sort selector. */
export function BoardToolbar({ view, onView, filters, onFilters }: Props) {
  const { t } = useI18n();
  const priorities: Array<{ value: Priority | "all"; label: string }> = [
    { value: "all", label: t("filter.all") },
    { value: "high", label: t("priority.high") },
    { value: "medium", label: t("priority.medium") },
    { value: "low", label: t("priority.low") },
  ];
  const sorts: Array<{ value: SortMode; label: string }> = [
    { value: "manual", label: t("sort.manual") },
    { value: "priority", label: t("sort.priority") },
    { value: "due", label: t("sort.due") },
    { value: "newest", label: t("sort.newest") },
  ];
  const modes: Array<{ id: ViewMode; icon: "board" | "list"; label: string }> = [
    { id: "board", icon: "board", label: t("view.board") },
    { id: "list", icon: "list", label: t("view.list") },
  ];
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div role="tablist" className="relative flex w-fit rounded-control bg-sage-100 p-1">
        {modes.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={view === m.id} onClick={() => onView(m.id)} className={`relative flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-sm transition-colors duration-200 ${view === m.id ? "font-medium text-forest-900" : "text-muted hover:text-ink"}`}>
            {view === m.id && <motion.span layoutId="view-seg" className="absolute inset-0 rounded-[8px] bg-surface shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <Icon name={m.icon} size={15} className="relative" />
            <span className="relative">{m.label}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
        <SearchField className="col-span-2 md:w-60" value={filters.query} onChange={(query) => onFilters({ ...filters, query })} placeholder={t("search.placeholder")} clearLabel={t("search.clear")} />
        <Select value={filters.priority} onChange={(priority) => onFilters({ ...filters, priority })} options={priorities} ariaLabel={t("filter.priority")} prefix={<Icon name="filter" size={15} className="text-muted" />} className="md:w-44" />
        <Select value={filters.sort} onChange={(sort) => onFilters({ ...filters, sort })} options={sorts} ariaLabel={t("sort.label")} className="md:w-44" />
      </div>
    </div>
  );
}
