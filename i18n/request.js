import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

const LOCALES = ["en", "hi", "ta", "te"];

export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get("locale")?.value;
  const locale = LOCALES.includes(requested) ? requested : "en";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
