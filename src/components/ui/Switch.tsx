"use client";

import { motion } from "motion/react";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** Themed on/off switch with a label and optional description. */
export function Switch({ checked, onChange, label, description, disabled = false }: Props) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex w-full items-start justify-between gap-4 rounded-control py-2 text-left disabled:cursor-not-allowed disabled:opacity-50">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <span className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${checked ? "justify-end bg-forest-600" : "justify-start bg-sage-200"}`}>
        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }} className="size-5 rounded-full bg-surface shadow-sm" />
      </span>
    </button>
  );
}
