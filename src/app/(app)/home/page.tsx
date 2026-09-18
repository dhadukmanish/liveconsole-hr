import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardMuted, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { visibleUserIds } from "@/lib/scope";

function greetingKey(hour: number) {
  if (hour < 12) return "home.greetingMorning";
  if (hour < 17) return "home.greetingAfternoon";
  return "home.greetingEvening";
}

export default async function HomePage() {
  const user = await requireUser();
  const t = await getTranslations();

  const scope = await visibleUserIds(user);
  const [peopleCount, myDocuments] = await Promise.all([
    prisma.user.count({
      where: scope === "ALL" ? {} : { id: { in: scope } },
    }),
    prisma.document.count({ where: { userId: user.id } }),
  ]);

  const teamCount = scope === "ALL" ? peopleCount : Math.max(0, scope.length - 1);
  const firstName = user.name.split(/\s+/)[0];

  return (
    <>
      <header className="mb-4">
        <h1 className="text-xl font-bold text-ink">
          {t(greetingKey(new Date().getHours()) as "home.greetingMorning", { name: firstName })}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          {t(`roles.${user.roleCode}` as "roles.ADMIN")}
          {user.profile?.employeeCode ? ` · ${user.profile.employeeCode}` : ""}
        </p>
      </header>

      {/* The one big primary action on this screen — inert until Phase 2. */}
      <Card className="mb-4">
        <Button size="lg" disabled aria-describedby="checkin-note">
          {t("home.checkIn")}
        </Button>
        <CardMuted id="checkin-note" className="mt-2 text-center">
          {t("home.checkInDisabled")}
        </CardMuted>
      </Card>

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-bold text-muted uppercase">{t("home.stats")}</h2>
        <div className="grid grid-cols-2 gap-3">
          {can(user, "USERS", "VIEW") ? (
            <Card>
              <p className="text-2xl font-bold text-ink">{peopleCount}</p>
              <CardMuted>{t("home.statUsers")}</CardMuted>
            </Card>
          ) : null}
          <Card>
            <p className="text-2xl font-bold text-ink">{myDocuments}</p>
            <CardMuted>{t("home.statDocuments")}</CardMuted>
          </Card>
          {user.roleCode !== "EMPLOYEE" ? (
            <Card>
              <p className="text-2xl font-bold text-ink">{teamCount}</p>
              <CardMuted>{t("home.statTeam")}</CardMuted>
            </Card>
          ) : null}
          <Card>
            <p className="text-2xl font-bold text-muted">—</p>
            <CardMuted>{t("home.statPending")}</CardMuted>
          </Card>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-muted uppercase">{t("home.myTasks")}</h2>
          <Badge tone="pending">{t("common.comingSoon")}</Badge>
        </div>
        <EmptyState>{t("home.tasksDisabled")}</EmptyState>
      </section>

      <section className="mt-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/more" className="block">
            <Card className="h-full transition-colors hover:border-brand">
              <CardTitle>{t("more.profile")}</CardTitle>
              <CardMuted className="mt-1">{t("more.idCard")} · {t("more.documents")}</CardMuted>
            </Card>
          </Link>
          {can(user, "USERS", "VIEW") ? (
            <Link href="/users" className="block">
              <Card className="h-full transition-colors hover:border-brand">
                <CardTitle>{t("nav.users")}</CardTitle>
                <CardMuted className="mt-1">{peopleCount}</CardMuted>
              </Card>
            </Link>
          ) : null}
        </div>
      </section>
    </>
  );
}
