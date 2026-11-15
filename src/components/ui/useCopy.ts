import { useCallback, useEffect, useRef, useState } from "react";
import type { AppError } from "@/lib/errors/AppError";
import { errorCenter } from "@/lib/errors/ErrorCenter";

/** Copies the diagnostics text to the clipboard and reports whether it worked (a failure is shown, never ignored). */
export function useCopyDiagnostics(error?: AppError) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(errorCenter.diagnostics(error));
      setState("ok");
    } catch (e) {
      errorCenter.report(e, { action: "diagnostics.copy", surface: "inline" });
      setState("fail");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2200);
  }, [error]);
  return { state, copy };
}
