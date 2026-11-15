"use client";

import { useEffect } from "react";
import { errorCenter } from "@/lib/errors/ErrorCenter";
import { AppError } from "@/lib/errors/AppError";
import { LocalPrefs } from "@/lib/storage";

/** Routes uncaught errors, unhandled promise rejections and preference-storage failures into the error center. */
export function GlobalErrorHandlers() {
  useEffect(() => {
    let prefsReported = false;
    LocalPrefs.onError = (error, action) => {
      // Reported once per session: the same blocked storage would otherwise warn on every read and write.
      if (prefsReported) return;
      prefsReported = true;
      errorCenter.report(new AppError("PREFS_UNAVAILABLE", { severity: "warning", cause: error, details: String(error) }), { action });
    };
    const onError = (e: ErrorEvent) => {
      if (e.message?.includes("ResizeObserver loop")) return; // harmless browser notice, not a failure
      errorCenter.report(e.error ?? new Error(e.message), { action: "window.error" });
    };
    const onRejection = (e: PromiseRejectionEvent) => errorCenter.report(e.reason, { action: "unhandledrejection" });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      LocalPrefs.onError = null;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
