"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { changeLocale } from "@/app/actions/locale";
import { locales, localeNames } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/** Three short pills — clearer on a phone than a dropdown. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const active = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <div className={cn("flex gap-2", className)} role="group" aria-label="Language">
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          disabled={pending}
          onClick={() => {
            const data = new FormData();
            data.set("locale", locale);
            startTransition(() => {
              void changeLocale(data);
            });
          }}
          className={cn(
            "min-h-12 flex-1 rounded-xl border px-3 text-sm font-semibold transition-colors",
            active === locale
              ? "border-brand bg-brand text-on-brand"
              : "border-hairline bg-card text-ink hover:border-brand",
          )}
          aria-pressed={active === locale}
        >
          {localeNames[locale]}
        </button>
      ))}
    </div>
  );
}
