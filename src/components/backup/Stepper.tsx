"use client";

import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "@/i18n";
import type { StepState, StepStatus } from "@/lib/backup/types";

/** Round status marker: hollow, spinning, drawn check, notice, cross or dash. */
function StepIcon({ status }: { status: StepStatus }) {
  const base = "relative z-10 grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-300";
  const palette: Record<StepStatus, string> = {
    pending: "border border-line bg-surface text-transparent",
    running: "border border-forest-600/40 bg-sage-50 text-forest-700",
    done: "bg-forest-600 text-white",
    warning: "bg-amber-tone text-white",
    error: "bg-danger text-white",
    skipped: "bg-sage-100 text-muted",
  };
  return (
    <span className={`${base} ${palette[status]}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.svg key={status} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.18 }} aria-hidden="true">
          {status === "running" && <circle cx="12" cy="12" r="8" strokeDasharray="22 40" className="origin-center animate-spin" />}
          {status === "done" && <motion.path d="m5 12.5 4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.05 }} />}
          {status === "warning" && <path d="M12 7v6M12 17h.01" />}
          {status === "error" && <path d="M7 7l10 10M17 7 7 17" />}
          {status === "skipped" && <path d="M7 12h10" />}
        </motion.svg>
      </AnimatePresence>
    </span>
  );
}

const finished = (s: StepStatus) => s === "done" || s === "warning" || s === "skipped";

/** Vertical step list with an overall progress bar. Each step shows its title and a detail line when finished. */
export function Stepper({ steps }: { steps: StepState[] }) {
  const { t } = useI18n();
  const done = steps.filter((s) => finished(s.status)).length;
  const ratio = steps.length ? done / steps.length : 0;
  return (
    <div>
      <div className="mb-4 flex items-center gap-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sage-100">
          <motion.div className={`h-full rounded-full ${steps.some((s) => s.status === "error") ? "bg-danger" : "bg-forest-600"}`} initial={false} animate={{ width: `${ratio * 100}%` }} transition={{ type: "spring", stiffness: 160, damping: 24 }} />
        </div>
        <span className="text-xs tabular-nums text-muted">{done}/{steps.length}</span>
      </div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && (
              <span className="absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px bg-line">
                <motion.span className="block h-full w-full origin-top bg-forest-600" initial={false} animate={{ scaleY: finished(s.status) ? 1 : 0 }} transition={{ duration: 0.3 }} />
              </span>
            )}
            <StepIcon status={s.status} />
            <div className="min-w-0 pt-0.5">
              <p className={`text-sm transition-colors duration-200 ${s.status === "pending" ? "text-muted" : "font-medium text-ink"} ${s.status === "error" ? "text-danger" : ""}`}>{t(s.titleKey)}</p>
              <AnimatePresence initial={false}>
                {s.detail && (
                  <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.22 }} className="break-words text-xs text-muted">
                    {t(s.detail.key, s.detail.vars)}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
