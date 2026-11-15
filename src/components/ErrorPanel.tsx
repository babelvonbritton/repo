"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useI18n } from "@/i18n";
import { describeError } from "@/lib/errors/describe";
import type { AppError } from "@/lib/errors/AppError";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { useCopyDiagnostics } from "./ui/useCopy";

interface Props {
  error: AppError;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/** Inline error: what happened, what to do, and collapsible technical details with a copy button. */
export function ErrorPanel({ error, onRetry, retryLabel, className = "" }: Props) {
  const { t } = useI18n();
  const { title, hint } = describeError(error, t);
  const [open, setOpen] = useState(false);
  const { state, copy } = useCopyDiagnostics(error);
  return (
    <motion.div role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`rounded-card border border-danger/25 bg-danger/5 p-4 ${className}`}>
      <div className="flex gap-3">
        <Icon name="alert" size={20} className="mt-0.5 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="font-medium text-danger">{title}</p>
          <p className="mt-0.5 text-sm text-ink/80">{hint}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {onRetry && <Button variant="ghost" className="h-8 px-3" onClick={onRetry}>{retryLabel ?? t("error.retry")}</Button>}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-8 items-center gap-1 rounded-control px-2 text-xs text-muted transition-colors hover:bg-sage-50 hover:text-ink">
          {t("error.technical")}
          <Icon name="chevron" size={13} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        <button type="button" onClick={copy} className="flex h-8 items-center gap-1.5 rounded-control px-2 text-xs text-muted transition-colors hover:bg-sage-50 hover:text-ink">
          <Icon name="copy" size={13} />
          {state === "ok" ? t("error.copied") : state === "fail" ? t("error.copyFailed") : t("error.copy")}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.pre initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-control bg-surface p-3 text-xs text-ink/80">
            {error.code}
            {error.details ? `\n${error.details}` : ""}
          </motion.pre>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
