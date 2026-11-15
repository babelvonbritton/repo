"use client";

import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icon";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
  className?: string;
}

/** Themed search input with an animated clear button. */
export function SearchField({ value, onChange, placeholder, clearLabel, className = "" }: Props) {
  return (
    <div className={`group flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 transition-[border-color,box-shadow] duration-200 focus-within:border-forest-600 focus-within:shadow-[0_0_0_3px_rgba(59,106,83,0.12)] hover:border-sage-200 ${className}`}>
      <Icon name="search" size={16} className="shrink-0 text-muted transition-colors group-focus-within:text-forest-600" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/70 [&::-webkit-search-cancel-button]:hidden"
      />
      <AnimatePresence>
        {value && (
          <motion.button
            type="button"
            aria-label={clearLabel}
            onClick={() => onChange("")}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.15 }}
            className="grid size-5 place-items-center rounded-full bg-sage-100 text-muted hover:bg-sage-200"
          >
            <Icon name="close" size={12} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
