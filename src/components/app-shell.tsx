"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BookUser,
  CalendarCheck,
  ClipboardList,
  FileText,
  Home,
  BarChart3,
  KeyRound,
  MessageSquare,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  labelKey: string;
  icon: keyof typeof ICONS;
};

const ICONS = {
  home: Home,
  task: ClipboardList,
  attendance: CalendarCheck,
  leave: FileText,
  more: MoreHorizontal,
  users: Users,
  permissions: ShieldCheck,
  documents: FileText,
  phonebook: BookUser,
  licenses: KeyRound,
  notifications: MessageSquare,
  reports: BarChart3,
  settings: Settings,
} as const;

function isActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Mobile: bottom tab bar (five items, thumb-reachable).
 * >=768px: left sidebar with the same items plus the admin sections.
 */
export function AppShell({
  tabs,
  sidebarExtras,
  userName,
  roleName,
  children,
}: {
  tabs: NavItem[];
  sidebarExtras: NavItem[];
  userName: string;
  roleName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-64 shrink-0 border-r border-hairline bg-card md:block">
        <div className="sticky top-0 flex h-dvh flex-col p-4">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand font-bold text-on-brand">
              LC
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{t("common.appName")}</p>
              <p className="truncate text-xs text-muted">{roleName}</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {[...tabs, ...sidebarExtras].map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                    active
                      ? "bg-brand text-on-brand"
                      : "text-ink hover:bg-hairline/60",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="truncate">{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </nav>

          <p className="mt-auto truncate pt-4 text-xs text-muted">{userName}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* pb-24 keeps content clear of the fixed tab bar on phones. */}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label={t("nav.home")}
      >
        <ul className="flex">
          {tabs.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.6875rem] font-semibold",
                    active ? "text-brand-ink" : "text-muted",
                  )}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                  <span className="truncate">{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
