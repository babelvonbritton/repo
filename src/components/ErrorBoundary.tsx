"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "@/i18n";
import { AppError } from "@/lib/errors/AppError";
import { errorCenter } from "@/lib/errors/ErrorCenter";
import { ErrorPanel } from "./ErrorPanel";
import { Logo } from "./Logo";

function CrashScreen({ error }: { error: AppError }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        <Logo />
        <ErrorPanel error={error} onRetry={() => window.location.reload()} retryLabel={t("error.reload")} />
      </div>
    </div>
  );
}

/** Catches rendering failures anywhere below it and shows a recoverable screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: AppError | null }> {
  state: { error: AppError | null } = { error: null };

  static getDerivedStateFromError(cause: unknown): { error: AppError } {
    return { error: new AppError("RENDER_CRASH", { cause, details: cause instanceof Error ? cause.message : String(cause) }) };
  }

  componentDidCatch(cause: unknown, info: ErrorInfo): void {
    const stack = (info.componentStack ?? "").split("\n").slice(0, 6).join("\n");
    errorCenter.report(new AppError("RENDER_CRASH", { cause, details: `${cause instanceof Error ? cause.message : String(cause)}\n${stack}` }), { action: "render", surface: "inline" });
  }

  render(): ReactNode {
    return this.state.error ? <CrashScreen error={this.state.error} /> : this.props.children;
  }
}
