import type { Metadata } from "next";
import { PrivacyContent } from "@/components/legal/PrivacyContent";
import { isLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const messages = (await import(`../../../../messages/${locale}.json`)).default;
  return { title: `${messages.privacy.title} | Repo` };
}

export default function PrivacyPage() {
  return <PrivacyContent />;
}
