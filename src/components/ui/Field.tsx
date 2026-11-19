"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/i18n";
import { Toggletip } from "./Toggletip";

/** Shared look for text inputs and textareas. */
export const inputClass =
  "w-full rounded-control border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70 transition-[border-color,box-shadow] duration-200 hover:border-sage-200 focus:border-forest-600 focus:shadow-[0_0_0_3px_rgba(59,106,83,0.12)] focus:outline-none";

/** Label plus control wrapper used by forms. A `hint` adds a "?" button next to the label that explains the field. */
export function Field({ label, htmlFor, aside, hint, children }: { label: string; htmlFor?: string; aside?: ReactNode; hint?: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1">
          <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}</label>
          {hint && <Toggletip label={t("hint.moreAbout", { field: label })} text={hint} />}
        </span>
        {aside}
      </div>
      {children}
    </div>
  );
}
