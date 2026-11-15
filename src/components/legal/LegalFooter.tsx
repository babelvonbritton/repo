"use client";

import Link from "next/link";
import { useI18n } from "@/i18n";
import { APP_VERSION } from "@/lib/appInfo";

/** Copyright line with the privacy and policy reference, license and version. */
export function LegalFooter({ className = "" }: { className?: string }) {
  const { t, localeCode } = useI18n();
  const policy = `/${localeCode}/privacy/`;
  return (
    <footer className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted md:px-10 ${className}`}>
      <span>© 2026 Alzam A. All Rights Reserved.</span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href={policy} className="transition-colors hover:text-forest-700 hover:underline">{t("legal.privacy")}</Link>
        <Link href={`${policy}#terms`} className="transition-colors hover:text-forest-700 hover:underline">{t("legal.license")}</Link>
        <span>{t("legal.version", { version: APP_VERSION })}</span>
      </span>
    </footer>
  );
}
