import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardMuted } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { CheckInCard } from "@/components/check-in-card";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { visibleUserIds } from "@/lib/scope";
import { initials } from "@/lib/utils";
import {
  formatDate,
  formatIstTime,
  minutesToHours,
  startOfMonth,
  workDateFor,
} from "@/lib/workday";
import { todayAttendance } from "./actions";

const STATUS_TONE = {
  PRESENT: "success",
  HALF_DAY: "pending",
  ON_LEAVE: "brand",
  ABSENT: "danger",
} as const;

export default async function AttendancePage() {
  const user = await requirePermissionPage("ATTENDANCE", "VIEW");
  const t = await getTranslations();

  const today = workDateFor();
  const mine = await todayAttendance(user.id);

  const month = await prisma.attendance.findMany({
    where: { userId: user.id, workDate: { gte: startOfMonth(today) } },
    orderBy: { workDate: "desc" },
  });

  // Team view is gated by scope, not just by the permission: an admin sees
  // their own reporting line, a super admin sees everyone.
  const scope = await visibleUserIds(user);
  const showsTeam = scope === "ALL" || scope.length > 1;

  const team = showsTeam
    ? await prisma.user.findMany({
        where: {
          ...(scope === "ALL" ? {} : { id: { in: scope } }),
          status: "ACTIVE",
          id: { not: user.id, ...(scope === "ALL" ? {} : { in: scope }) },
        },
        select: {
          id: true,
          name: true,
          attendance: { where: { workDate: today }, take: 1 },
        },
        orderBy: { name: "asc" },
        take: 100,
      })
    : [];

  const presentToday = team.filter((row) => row.attendance[0]?.checkInAt).length;

  return (
    <>
      <PageHeader title={t("nav.attendance")} subtitle={formatDate(today)} />

      <Card className="mb-4">
        <CheckInCard
          checkedInAt={mine?.checkInAt ? formatIstTime(mine.checkInAt) : null}
          checkedOutAt={mine?.checkOutAt ? formatIstTime(mine.checkOutAt) : null}
          workedLabel={mine?.workedMinutes ? minutesToHours(mine.workedMinutes) : null}
        />
      </Card>

      {showsTeam ? (
        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-muted uppercase">
              {t("attendance.teamToday")}
            </h2>
            <Badge tone="success">
              {t("attendance.presentCount", { count: presentToday, total: team.length })}
            </Badge>
          </div>
          {team.length === 0 ? (
            <EmptyState>{t("common.noResults")}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {team.map((row) => {
                const record = row.attendance[0];
                return (
                  <li key={row.id}>
                    <Card className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand-ink">
                        {initials(row.name)}
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                        {row.name}
                      </p>
                      {record?.checkInAt ? (
                        <span className="shrink-0 text-sm text-muted">
                          {formatIstTime(record.checkInAt)}
                          {record.checkOutAt ? ` — ${formatIstTime(record.checkOutAt)}` : ""}
                        </span>
                      ) : (
                        <Badge tone="neutral">{t("attendance.notIn")}</Badge>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-bold text-muted uppercase">
          {t("attendance.thisMonth")}
        </h2>
        {month.length === 0 ? (
          <EmptyState>{t("attendance.noRecords")}</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {month.map((row) => (
              <li key={row.id}>
                <Card className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{formatDate(row.workDate)}</p>
                    <CardMuted>
                      {row.checkInAt ? formatIstTime(row.checkInAt) : "—"}
                      {row.checkOutAt ? ` — ${formatIstTime(row.checkOutAt)}` : ""}
                      {row.workedMinutes ? ` · ${minutesToHours(row.workedMinutes)}` : ""}
                    </CardMuted>
                  </div>
                  <Badge tone={STATUS_TONE[row.status]}>
                    {t(`attendance.status.${row.status}` as "attendance.status.PRESENT")}
                  </Badge>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!can(user, "ATTENDANCE", "ADD") ? (
        <CardMuted className="mt-4">{t("attendance.viewOnly")}</CardMuted>
      ) : null}
    </>
  );
}
