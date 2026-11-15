"use client";

import * as Popover from "@radix-ui/react-popover";
import { useMemo, useState } from "react";
import { useI18n } from "@/i18n";
import { formatDate } from "@/lib/workspace/ordering";
import { Icon } from "./Icon";

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
}

/** Themed date picker: popover calendar that stores dates as YYYY-MM-DD. */
export function DatePicker({ value, onChange, id }: Props) {
  const { t, locale, localeCode } = useI18n();
  const weekStart = localeCode === "id" ? 1 : 0; // Monday in Indonesia, Sunday in the US and Japan
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => (value ? parse(value) : new Date()));
  const today = toIso(new Date());

  const days = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const offset = (new Date(y, m, 1).getDay() - weekStart + 7) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(y, m, 1 - offset + i));
  }, [cursor, weekStart]);

  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2023, 0, 1 + weekStart + i))),
    [locale, weekStart],
  );
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(cursor);
  const shift = (delta: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  const pick = (iso: string | null) => {
    onChange(iso);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setCursor(value ? parse(value) : new Date()); }}>
      <Popover.Trigger
        id={id}
        className="group flex h-10 w-full items-center justify-between gap-2 rounded-control border border-line bg-surface px-3 text-sm transition-[border-color,box-shadow] duration-200 hover:border-sage-200 data-[state=open]:border-forest-600 data-[state=open]:shadow-[0_0_0_3px_rgba(59,106,83,0.12)]"
      >
        <span className={value ? "text-ink" : "text-muted/70"}>{value ? formatDate(value, locale) : t("date.pick")}</span>
        <Icon name="calendar" size={16} className="text-muted" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="start" className="anim-pop z-[80] w-72 rounded-card border border-line bg-surface p-3 shadow-[0_16px_36px_-14px_rgba(28,47,38,0.3)] outline-none">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label={t("date.prev")} onClick={() => shift(-1)} className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-sage-50"><Icon name="chevronLeft" size={16} /></button>
            <span className="text-sm font-medium capitalize">{monthLabel}</span>
            <button type="button" aria-label={t("date.next")} onClick={() => shift(1)} className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-sage-50"><Icon name="chevronRight" size={16} /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs text-muted">
            {weekdays.map((w, i) => <span key={i} className="py-1">{w}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map((d) => {
              const iso = toIso(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const selected = iso === value;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => pick(iso)}
                  className={`mx-auto grid size-9 place-items-center rounded-full text-sm transition-colors duration-150 ${selected ? "bg-forest-700 text-white" : inMonth ? "text-ink hover:bg-sage-100" : "text-muted/50 hover:bg-sage-50"} ${iso === today && !selected ? "ring-1 ring-forest-600" : ""}`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-2 text-sm">
            <button type="button" onClick={() => pick(null)} className="rounded-control px-2 py-1 text-muted transition-colors hover:bg-sage-50">{t("date.clear")}</button>
            <button type="button" onClick={() => pick(today)} className="rounded-control px-2 py-1 font-medium text-forest-700 transition-colors hover:bg-sage-50">{t("date.today")}</button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
