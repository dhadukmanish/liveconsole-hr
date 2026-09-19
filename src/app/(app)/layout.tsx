import { getTranslations } from "next-intl/server";
import { AppShell, type NavItem } from "@/components/app-shell";
import { BetaBanner } from "@/components/beta-banner";
import { ForcedPasswordChange } from "@/components/forced-password-change";
import { requireUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const t = await getTranslations();

  // Bottom bar stays at five items per the design, so anything beyond the four
  // core modules lives in the sidebar and under More.
  const tabs: NavItem[] = [
    { href: "/home", labelKey: "nav.home", icon: "home" },
    ...(can(user, "TASK", "VIEW")
      ? [{ href: "/tasks", labelKey: "nav.task", icon: "task" as const }]
      : []),
    ...(can(user, "ATTENDANCE", "VIEW")
      ? [{ href: "/attendance", labelKey: "nav.attendance", icon: "attendance" as const }]
      : []),
    ...(can(user, "LEAVE", "VIEW")
      ? [{ href: "/leave", labelKey: "nav.leave", icon: "leave" as const }]
      : []),
    { href: "/more", labelKey: "nav.more", icon: "more" },
  ];

  const sidebarExtras: NavItem[] = [
    ...(can(user, "DOCUMENTS", "VIEW")
      ? [{ href: "/documents", labelKey: "nav.documents", icon: "documents" as const }]
      : []),
    ...(can(user, "PHONEBOOK", "VIEW")
      ? [{ href: "/phonebook", labelKey: "nav.phonebook", icon: "phonebook" as const }]
      : []),
    ...(can(user, "LICENSES", "VIEW")
      ? [{ href: "/licenses", labelKey: "nav.licenses", icon: "licenses" as const }]
      : []),
    ...(can(user, "USERS", "VIEW")
      ? [{ href: "/users", labelKey: "nav.users", icon: "users" as const }]
      : []),
    ...(user.isSuperAdmin
      ? [
          { href: "/permissions", labelKey: "nav.permissions", icon: "permissions" as const },
          { href: "/notifications", labelKey: "nav.notifications", icon: "notifications" as const },
        ]
      : []),
    ...(can(user, "SETTINGS", "VIEW")
      ? [{ href: "/settings", labelKey: "nav.settings", icon: "settings" as const }]
      : []),
  ];

  // Hard gate rather than a banner: an admin-issued password must be replaced
  // before the account can be used for anything else.
  if (user.mustChangePassword) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-8">
        <BetaBanner className="mb-4" />
        <ForcedPasswordChange name={user.name} />
      </main>
    );
  }

  return (
    <AppShell
      tabs={tabs}
      sidebarExtras={sidebarExtras}
      userName={user.name}
      roleName={t(`roles.${user.roleCode}` as "roles.ADMIN")}
    >
      <BetaBanner className="mb-4" />
      {children}
    </AppShell>
  );
}
