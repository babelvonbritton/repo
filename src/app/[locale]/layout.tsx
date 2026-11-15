import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isLocale, LOCALES, LOCALE_TAGS } from "@/i18n/routing";
import "../globals.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

/**
 * Content Security Policy for static hosting (a meta tag, because GitHub Pages cannot send headers).
 * Applied in production only; the dev server needs looser rules for hot reload.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

async function loadMessages(locale: string) {
  return (await import(`../../../messages/${locale}.json`)).default;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const messages = await loadMessages(locale);
  return {
    title: "Repo",
    description: messages.app.tagline,
    referrer: "no-referrer",
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [LOCALE_TAGS[l], `/${l}/`])) },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f7f2",
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale); // keeps the page statically rendered
  const messages = await loadMessages(locale);
  return (
    <html lang={locale}>
      <head>{process.env.NODE_ENV === "production" && <meta httpEquiv="Content-Security-Policy" content={CSP} />}</head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
