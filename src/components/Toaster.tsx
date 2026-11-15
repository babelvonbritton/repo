"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { describeError } from "@/lib/errors/describe";
import { errorCenter, type ToastEvent } from "@/lib/errors/ErrorCenter";
import { Icon } from "./ui/Icon";
import { useCopyDiagnostics } from "./ui/useCopy";

function Toast({ event, onClose }: { event: ToastEvent; onClose: () => void }) {
  const { t } = useI18n();
  const error = event.kind === "error" ? event.error : undefined;
  const { state, copy } = useCopyDiagnostics(error);
  const text = error ? describeError(error, t) : { title: t(event.kind === "success" ? event.msg.key : "error.generic", event.kind === "success" ? event.msg.vars : undefined), hint: "" };
  const warn = error?.severity === "warning";
  return (
    <motion.div
      layout
      role={error ? "alert" : "status"}
      initial={{ opacity: 0, y: -14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className="pointer-events-auto flex gap-3 rounded-card border border-line bg-surface p-3.5 shadow-[0_18px_40px_-18px_rgba(28,47,38,0.45)]"
    >
      <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${error ? (warn ? "bg-amber-tone/15 text-amber-tone" : "bg-danger/10 text-danger") : "bg-forest-600/10 text-forest-700"}`}>
        <Icon name={error ? "alert" : "check"} size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{text.title}</p>
        {text.hint && <p className="mt-0.5 text-xs leading-relaxed text-muted">{text.hint}</p>}
        {error && (
          <button type="button" onClick={copy} className="mt-1.5 text-xs text-forest-700 underline-offset-2 hover:underline">
            {state === "ok" ? t("error.copied") : state === "fail" ? t("error.copyFailed") : t("error.copy")}
          </button>
        )}
      </div>
      <button type="button" onClick={onClose} aria-label={t("toast.dismiss")} className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-sage-50 hover:text-ink">
        <Icon name="close" size={13} />
      </button>
    </motion.div>
  );
}

/** Notification stack fed by the error center. Errors stay longer than confirmations. */
export function Toaster() {
  const [events, setEvents] = useState<ToastEvent[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const live = timers.current;
    const off = errorCenter.subscribe((event) => {
      setEvents((prev) => [...prev.slice(-3), event]);
      live.add(setTimeout(() => setEvents((prev) => prev.filter((e) => e.id !== event.id)), event.kind === "error" ? 10_000 : 4_500));
    });
    return () => {
      off();
      live.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[90] ml-auto flex max-w-sm flex-col gap-2 md:right-6 md:top-5">
      <AnimatePresence initial={false}>
        {events.map((event) => (
          <Toast key={event.id} event={event} onClose={() => setEvents((prev) => prev.filter((e) => e.id !== event.id))} />
        ))}
      </AnimatePresence>
    </div>
  );
}
