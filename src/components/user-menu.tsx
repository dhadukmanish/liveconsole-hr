"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, KeyRound, LogOut, UserCircle } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";

/**
 * Who you are signed in as, and the way out.
 *
 * Signing out used to live at the bottom of the More screen, below the profile
 * links, the admin links, the language card and the theme card — seventeen
 * hundred pixels down a screen that is eight hundred tall. It was in the app
 * and it was not findable, which is the same thing as missing. This is the
 * boilerplate's arrangement: identity sits in the top bar on every screen, and
 * the way out is one tap inside it.
 *
 * Built out of a button and a panel rather than a menu library: the app has no
 * dropdown primitive, and adding one to hold four links would be a strange
 * place to start. It closes on Escape, on a click outside it, and on
 * navigating — the last one because a panel left open over the screen you just
 * asked for is the kind of thing nobody reports and everybody notices.
 */
export function UserMenu({
  name,
  roleName,
  initials,
  canChangePassword,
}: {
  name: string;
  roleName: string;
  initials: string;
  canChangePassword: boolean;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const item =
    "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-ink transition-colors hover:bg-accent";

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-h-11 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-accent"
      >
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand-ink"
        >
          {initials}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-36 truncate text-xs leading-tight font-semibold text-ink">
            {name}
          </span>
          <span className="block max-w-36 truncate text-xs text-muted">{roleName}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="lc-fade absolute right-0 z-40 mt-1 w-60 rounded-card border border-hairline bg-card p-1.5 shadow-card"
        >
          <div className="px-2.5 py-1.5">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-muted">{roleName}</p>
          </div>
          <div className="my-1 h-px bg-hairline" />

          <Link href="/more/profile" className={item} role="menuitem">
            <UserCircle className="h-4 w-4 text-muted" aria-hidden />
            {t("more.profile")}
          </Link>
          {canChangePassword ? (
            <Link href="/more/change-password" className={item} role="menuitem">
              <KeyRound className="h-4 w-4 text-muted" aria-hidden />
              {t("auth.changePassword")}
            </Link>
          ) : null}

          <div className="my-1 h-px bg-hairline" />

          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className={`${item} w-full text-danger-ink hover:bg-danger/10`}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {t("auth.signOut")}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
