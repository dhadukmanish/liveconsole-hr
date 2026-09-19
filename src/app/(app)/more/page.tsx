import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  BarChart3,
  BookUser,
  ChevronRight,
  FileText,
  IdCard,
  KeyRound,
  MessageSquare,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
} from "lucide-react";
import { Card, CardMuted, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PageHeader } from "@/components/ui/page";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { initials } from "@/lib/utils";
import { requireUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { formatDateTimeIst } from "@/lib/workday";
import { BuildStamp } from "@/components/build-stamp";

const ROW =
  "flex min-h-14 items-center gap-3 border-b border-hairline px-1 text-sm font-semibold text-ink last:border-0";

export default async function MorePage() {
  const user = await requireUser();
  const t = await getTranslations();

  const links = [
    { href: "/more/profile", label: t("more.profile"), icon: UserCircle },
    { href: "/id-card", label: t("more.idCard"), icon: IdCard },
    { href: "/documents/me", label: t("more.documents"), icon: FileText },
    // Everybody has a report of their own, so this is not an admin link.
    { href: "/reports", label: t("nav.reports"), icon: BarChart3 },
    // The bottom bar is full at five tabs, so these two reach their screens here.
    ...(can(user, "PHONEBOOK", "VIEW")
      ? [{ href: "/phonebook", label: t("nav.phonebook"), icon: BookUser }]
      : []),
    ...(can(user, "LICENSES", "VIEW")
      ? [{ href: "/licenses", label: t("nav.licenses"), icon: ScrollText }]
      : []),
    ...(user.loginMethod === "PASSWORD"
      ? [{ href: "/more/change-password", label: t("auth.changePassword"), icon: KeyRound }]
      : []),
  ];

  /**
   * The administration screens used to exist only in the sidebar, which is
   * hidden below 768px — so on a phone an admin could not reach Users at all,
   * and creating somebody meant finding a laptop. They belong here too.
   */
  const adminLinks = [
    ...(can(user, "USERS", "VIEW")
      ? [{ href: "/users", label: t("nav.users"), icon: Users }]
      : []),
    ...(can(user, "DOCUMENTS", "VIEW")
      ? [{ href: "/documents", label: t("nav.documents"), icon: FileText }]
      : []),
    ...(can(user, "SETTINGS", "VIEW")
      ? [{ href: "/settings", label: t("nav.settings"), icon: Settings }]
      : []),
    ...(user.isSuperAdmin
      ? [
          { href: "/permissions", label: t("nav.permissions"), icon: ShieldCheck },
          { href: "/notifications", label: t("nav.notifications"), icon: MessageSquare },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader title={t("more.title")} />

      <Card className="mb-4 flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-on-brand">
          {initials(user.name)}
        </div>
        <div className="min-w-0">
          <CardTitle className="truncate">{user.name}</CardTitle>
          <CardMuted className="truncate">
            {user.profile?.designation ?? t(`roles.${user.roleCode}` as "roles.ADMIN")}
          </CardMuted>
          <CardMuted className="truncate">{user.mobile}</CardMuted>
        </div>
      </Card>

      <Card className="mb-4 py-1">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={ROW}>
            <link.icon className="h-5 w-5 text-brand-ink" aria-hidden />
            <span className="flex-1">{link.label}</span>
            <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
          </Link>
        ))}
      </Card>

      {adminLinks.length > 0 ? (
        <Card className="mb-4 py-1">
          <p className="px-1 pt-2 pb-1 text-xs font-bold uppercase tracking-wide text-muted">
            {t("more.admin")}
          </p>
          {adminLinks.map((link) => (
            <Link key={link.href} href={link.href} className={ROW}>
              <link.icon className="h-5 w-5 text-brand-ink" aria-hidden />
              <span className="flex-1">{link.label}</span>
              <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
            </Link>
          ))}
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardTitle className="mb-2">{t("auth.language")}</CardTitle>
        <LanguageSwitcher />
      </Card>

      <Card className="mb-4">
        <CardTitle className="mb-2">{t("more.theme")}</CardTitle>
        <ThemeSwitcher current={user.themePref} />
      </Card>

      <SignOutButton />

      {/* Which build this device is running. Rendered from the value inlined at
          build time, so it describes the payload the phone actually loaded. */}
      <BuildStamp
        label={`${process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev"} · ${
          process.env.NEXT_PUBLIC_BUILD_AT
            ? formatDateTimeIst(new Date(process.env.NEXT_PUBLIC_BUILD_AT))
            : "—"
        }`}
      />
    </>
  );
}
