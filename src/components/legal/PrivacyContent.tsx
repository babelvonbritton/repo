"use client";

import Link from "next/link";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import { Logo } from "../Logo";
import { Icon } from "../ui/Icon";
import { LegalFooter } from "./LegalFooter";

const SECTIONS = ["local", "tracking", "hosting", "backups", "control", "limits", "terms", "changes"] as const;
/** Date this policy was last changed. */
const UPDATED = new Date(2026, 10, 14);

/** The full privacy and policy page. */
export function PrivacyContent() {
  const { t, locale, localeCode } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:px-10">
        <Link href={`/${localeCode}/`}><Logo small /></Link>
        <Link href={`/${localeCode}/`} className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-forest-700">
          <Icon name="arrowLeft" size={15} />
          {t("legal.backToApp")}
        </Link>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-forest-900">{t("privacy.title")}</h1>
        <p className="mt-1 text-xs text-muted">{t("privacy.updated", { date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(UPDATED) })}</p>
        <p className="mt-5 leading-relaxed text-ink/90">{t("privacy.intro")}</p>
        {SECTIONS.map((s) => (
          <section key={s} id={s === "terms" ? "terms" : undefined} className="mt-8 scroll-mt-6">
            <h2 className="text-lg font-semibold text-forest-900">{t(`privacy.${s}.title` as MessageKey)}</h2>
            <p className="mt-2 leading-relaxed text-ink/90">{t(`privacy.${s}.body` as MessageKey)}</p>
          </section>
        ))}
      </main>
      <LegalFooter />
    </div>
  );
}
