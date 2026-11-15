"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { LOCALE_TAGS, type Locale } from "./routing";
import type { MessageKey } from "./types";

export type { MessageKey, Msg } from "./types";
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Typed access to next-intl: `t` for messages, `locale` (an Intl tag like en-US), `localeCode` (en, id, ja) and `has`. */
export function useI18n() {
  const translate = useTranslations();
  const localeCode = useLocale() as Locale;
  return useMemo(
    () => ({
      locale: LOCALE_TAGS[localeCode] ?? "en-US",
      localeCode,
      t: ((key, vars) => translate(key as never, vars as never)) as Translate,
      has: (key: string) => translate.has(key as never),
    }),
    [translate, localeCode],
  );
}
