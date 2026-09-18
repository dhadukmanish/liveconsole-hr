"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { changeTheme } from "@/app/actions/locale";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", key: "more.themeLight" },
  { value: "dark", key: "more.themeDark" },
  { value: "system", key: "more.themeSystem" },
] as const;

export function ThemeSwitcher({ current }: { current: string }) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2" role="group" aria-label={t("more.theme")}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={pending}
          aria-pressed={current === option.value}
          onClick={() => {
            const data = new FormData();
            data.set("theme", option.value);
            startTransition(() => {
              void changeTheme(data);
            });
          }}
          className={cn(
            "min-h-12 flex-1 rounded-xl border px-3 text-sm font-semibold transition-colors",
            current === option.value
              ? "border-brand bg-brand text-on-brand"
              : "border-hairline bg-card text-ink hover:border-brand",
          )}
        >
          {t(option.key)}
        </button>
      ))}
    </div>
  );
}
