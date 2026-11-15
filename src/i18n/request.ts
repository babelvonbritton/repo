import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "./routing";

/** next-intl request config: resolves the language of the page being rendered and loads its messages. */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
