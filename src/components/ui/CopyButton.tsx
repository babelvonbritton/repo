"use client";

import { useI18n } from "@/i18n";
import { Icon } from "./Icon";
import { useCopyText } from "./useCopy";

/** Last message shown, so a repeated identical message still announces (VoiceOver skips repeats). */
let lastMessage = "";

/**
 * Small copy button with inline "Copied" / "Copy failed" feedback.
 * The button stays enabled while feedback shows, and a repeat click restarts the timer.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useI18n();
  const { state, copy } = useCopyText();
  const message = state === "ok" ? t("error.copied") : state === "fail" ? t("error.copyFailed") : "";
  const announced = message && message === lastMessage ? `${message} ` : message;
  if (message) lastMessage = message;
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => void copy(text)}
        aria-label={label}
        className="grid size-6 place-items-center rounded-full text-muted transition-colors hover:bg-sage-50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest-600"
      >
        <Icon name={state === "ok" ? "check" : "copy"} size={14} />
      </button>
      <span role="status" className={`whitespace-nowrap text-xs text-muted ${state === "idle" ? "invisible" : ""}`}>
        {announced}
      </span>
    </span>
  );
}
