"use client";

import { useEffect } from "react";
import { guessLocale, isLocale } from "@/i18n/routing";
import { LocalPrefs } from "@/lib/storage/LocalPrefs";

/** Redirects from "/" to a language page: the saved choice first, otherwise the browser's preference. */
export function LocaleRedirect() {
  useEffect(() => {
    const saved = LocalPrefs.get("locale");
    const locale = isLocale(saved) ? saved : guessLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
    window.location.replace(`/${locale}/`);
  }, []);
  return <p className="grid min-h-dvh place-items-center text-sm text-muted">Repo</p>;
}
