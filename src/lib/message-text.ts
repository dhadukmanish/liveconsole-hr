import en from "../../messages/en.json";
import gu from "../../messages/gu.json";
import hi from "../../messages/hi.json";
import { defaultLocale, isLocale, type Locale } from "@/i18n/locales";

/**
 * Message lookup for text that is built outside a request — the cron that
 * drains the outbox has no cookie to read a language from, so the recipient's
 * stored locale is passed in explicitly.
 *
 * Deliberately not next-intl: its server helpers resolve the locale through
 * request state, and a message queued for somebody else must not depend on who
 * happened to trigger it.
 */
const BUNDLES: Record<Locale, unknown> = { en, hi, gu };

function lookup(bundle: unknown, key: string): string | undefined {
  let current: unknown = bundle;
  for (const part of key.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * "Hello {name}" with {name} replaced. Falls back to English, then to the key
 * itself — a visible key is a bug report; a blank message is a mystery.
 */
export function translate(
  locale: string | null | undefined,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const resolved: Locale = isLocale(locale) ? locale : defaultLocale;
  const template =
    lookup(BUNDLES[resolved], key) ?? lookup(BUNDLES[defaultLocale], key) ?? key;

  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
