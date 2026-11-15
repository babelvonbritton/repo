"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useI18n } from "@/i18n";
import type { Locale } from "@/i18n/routing";
import { LocalPrefs } from "@/lib/storage/LocalPrefs";

/** Current language and a function that switches it: remembers the choice and moves to that language's page. */
export function useLanguage() {
  const router = useRouter();
  const { localeCode } = useI18n();
  const setLanguage = useCallback(
    (next: Locale) => {
      if (next === localeCode) return;
      LocalPrefs.set("locale", next);
      router.replace(`/${next}/`);
    },
    [router, localeCode],
  );
  return { language: localeCode, setLanguage };
}
