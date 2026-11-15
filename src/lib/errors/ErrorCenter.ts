import { APP_NAME, APP_VERSION } from "@/lib/appInfo";
import type { Msg } from "@/i18n/types";
import { AppError } from "./AppError";

export type ToastEvent =
  | { id: number; kind: "error"; error: AppError }
  | { id: number; kind: "success"; msg: Msg };

interface LogRecord {
  time: string;
  code: string;
  action: string;
  message: string;
  details: string;
}

interface ReportOptions {
  /** Where the failure happened, for example "item.move". */
  action?: string;
  /** "toast" (default) shows a notification. "inline" means the caller shows it in its own UI; it is still logged. */
  surface?: "toast" | "inline";
}

/** Central place every failure goes through: normalizes, logs, and surfaces it. Nothing is swallowed. */
export class ErrorCenter {
  private readonly log: LogRecord[] = [];
  private readonly listeners = new Set<(event: ToastEvent) => void>();
  private lastToast = { key: "", at: 0 };
  private seq = 0;

  report(error: unknown, options: ReportOptions = {}): AppError {
    const appError = AppError.from(error);
    const action = options.action ?? "app";
    this.log.push({ time: new Date().toISOString(), code: appError.code, action, message: appError.message, details: appError.details ?? "" });
    if (this.log.length > 50) this.log.shift();
    console.error(`[Repo] ${appError.code} during ${action}`, appError.details ?? "", appError.cause ?? "");

    if (options.surface !== "inline") {
      const key = `${appError.code}:${action}`;
      const now = Date.now();
      // The same failure repeating within two seconds shows one notification, but is still logged above.
      if (key !== this.lastToast.key || now - this.lastToast.at > 2000) {
        this.lastToast = { key, at: now };
        this.emit({ id: ++this.seq, kind: "error", error: appError });
      }
    }
    return appError;
  }

  /** Shows a short success notification. */
  notify(msg: Msg): void {
    this.emit({ id: ++this.seq, kind: "success", msg });
  }

  subscribe(listener: (event: ToastEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Plain-text report for support. Contains error codes and record paths only, never item or note text. */
  diagnostics(current?: AppError): string {
    const lines = [`${APP_NAME} diagnostics`, `Version: ${APP_VERSION}`, `Time: ${new Date().toISOString()}`, `Browser: ${typeof navigator === "undefined" ? "n/a" : navigator.userAgent}`];
    if (current) lines.push("", `Error: ${current.code}`, current.details ? `Details:\n${current.details}` : "Details: none");
    lines.push("", "Recent errors (newest first):");
    for (const r of [...this.log].reverse().slice(0, 15)) lines.push(`- ${r.time} ${r.code} [${r.action}] ${r.details.split("\n")[0].slice(0, 160)}`);
    return lines.join("\n");
  }

  private emit(event: ToastEvent): void {
    this.listeners.forEach((l) => l(event));
  }
}

/** Shared instance for the whole app. */
export const errorCenter = new ErrorCenter();
