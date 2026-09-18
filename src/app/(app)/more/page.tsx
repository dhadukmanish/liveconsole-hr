import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight, FileText, IdCard, KeyRound, UserCircle } from "lucide-react";
import { Card, CardMuted, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PageHeader } from "@/components/ui/page";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { initials } from "@/lib/utils";
import { requireUser } from "@/lib/auth/guard";

const ROW =
  "flex min-h-14 items-center gap-3 border-b border-hairline px-1 text-sm font-semibold text-ink last:border-0";

export default async function MorePage() {
  const user = await requireUser();
  const t = await getTranslations();

  const links = [
    { href: "/more/profile", label: t("more.profile"), icon: UserCircle },
    { href: "/id-card", label: t("more.idCard"), icon: IdCard },
    { href: "/documents/me", label: t("more.documents"), icon: FileText },
    ...(user.loginMethod === "PASSWORD"
      ? [{ href: "/more/change-password", label: t("auth.changePassword"), icon: KeyRound }]
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
            <link.icon className="h-5 w-5 text-brand" aria-hidden />
            <span className="flex-1">{link.label}</span>
            <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
          </Link>
        ))}
      </Card>

      <Card className="mb-4">
        <CardTitle className="mb-2">{t("auth.language")}</CardTitle>
        <LanguageSwitcher />
      </Card>

      <Card className="mb-4">
        <CardTitle className="mb-2">{t("more.theme")}</CardTitle>
        <ThemeSwitcher current={user.themePref} />
      </Card>

      <SignOutButton />
    </>
  );
}
