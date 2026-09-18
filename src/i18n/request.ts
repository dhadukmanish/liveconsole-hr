import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, defaultLocale, isLocale } from "./locales";

/**
 * No locale prefix in URLs: the language lives on the user's profile and is
 * mirrored into a cookie at sign-in, so /home stays /home in every language.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : defaultLocale;

  return {
    locale,
    // Without this next-intl formats dates in the server's zone — the live site
    // was reporting America/Los_Angeles. Everything user-facing here is Indian
    // office time.
    timeZone: "Asia/Kolkata",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
