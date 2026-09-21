import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardMuted, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { ApplyLeaveForm, LeaveDecision } from "@/components/leave-forms";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { visibleUserIds } from "@/lib/scope";
import { cancelLeaveAction } from "./actions";
import {
  formatDate,
  startOfLeaveYear,
  toDateInput,
  workDateFor,
} from "@/lib/workday";

const STATUS_TONE = {
  PENDING: "pending",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
} as const;

export default async function LeavePage() {
  const user = await requirePermissionPage("LEAVE", "VIEW");
  const t = await getTranslations();
  const today = workDateFor();

  const [types, mine, balances] = await Promise.all([
    prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.leaveRequest.findMany({
      where: { userId: user.id },
      include: { leaveType: true, decidedBy: { select: { name: true } } },
      orderBy: { startDate: "desc" },
      take: 50,
    }),
    // Days already taken this leave year, per type. Only approved leave counts
    // against a balance; pending requests are shown but not deducted.
    prisma.leaveRequest.groupBy({
      by: ["leaveTypeId"],
      where: {
        userId: user.id,
        status: "APPROVED",
        startDate: { gte: startOfLeaveYear(today) },
      },
      _sum: { days: true },
    }),
  ]);

  const usedByType = new Map(balances.map((row) => [row.leaveTypeId, row._sum.days ?? 0]));

  // Pending requests from people this user can both see and approve.
  const scope = await visibleUserIds(user);
  const pendingForMe = can(user, "LEAVE", "APPROVE")
    ? await prisma.leaveRequest.findMany({
        where: {
          status: "PENDING",
          userId: { not: user.id, ...(scope === "ALL" ? {} : { in: scope }) },
        },
        include: { leaveType: true, user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
        take: 50,
      })
    : [];

  return (
    <>
      <PageHeader title={t("nav.leave")} />

      {pendingForMe.length > 0 ? (
        <section className="mb-4">
          <h2 className="mb-2 lc-section-label">
            {t("leave.awaitingYou", { count: pendingForMe.length })}
          </h2>
          <ul className="flex flex-col gap-2">
            {pendingForMe.map((row) => (
              <li key={row.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{row.user.name}</CardTitle>
                      <CardMuted>
                        {row.leaveType.name} · {formatDate(row.startDate)}
                        {row.days > 1 ? ` — ${formatDate(row.endDate)}` : ""} ·{" "}
                        {t("leave.dayCount", { days: row.days })}
                      </CardMuted>
                    </div>
                    <Badge tone="pending">{t("leave.status.PENDING")}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-ink">{row.reason}</p>
                  <LeaveDecision requestId={row.id} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {can(user, "LEAVE", "ADD") ? (
        <Card className="mb-4">
          <CardTitle className="mb-3">{t("leave.apply")}</CardTitle>
          <ApplyLeaveForm
            today={toDateInput(today)}
            types={types.map((type) => ({
              id: type.id,
              name: type.name,
              requiresApproval: type.requiresApproval,
            }))}
          />
        </Card>
      ) : null}

      <section className="mb-4">
        <h2 className="mb-2 lc-section-label">{t("leave.balance")}</h2>
        <div className="grid grid-cols-2 gap-3">
          {types.map((type) => {
            const used = usedByType.get(type.id) ?? 0;
            const left = type.annualDays === null ? null : type.annualDays - used;
            return (
              <Card key={type.id}>
                <p className="text-sm font-semibold text-ink">{type.name}</p>
                <p className="lc-numeric mt-1 text-2xl font-bold text-ink">
                  {left === null ? "—" : left}
                </p>
                <CardMuted>
                  {type.annualDays === null
                    ? t("leave.noAnnualLimit")
                    : t("leave.usedOf", { used, total: type.annualDays })}
                </CardMuted>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 lc-section-label">{t("leave.myRequests")}</h2>
        {mine.length === 0 ? (
          <EmptyState>{t("leave.noRequests")}</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {mine.map((row) => (
              <li key={row.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">{row.leaveType.name}</p>
                      <CardMuted>
                        {formatDate(row.startDate)}
                        {row.days > 1 ? ` — ${formatDate(row.endDate)}` : ""} ·{" "}
                        {t("leave.dayCount", { days: row.days })}
                        {row.isHalfDay ? ` (${t("leave.halfDay")})` : ""}
                      </CardMuted>
                    </div>
                    <Badge tone={STATUS_TONE[row.status]}>
                      {t(`leave.status.${row.status}` as "leave.status.PENDING")}
                    </Badge>
                  </div>

                  <p className="mt-2 text-sm text-muted">{row.reason}</p>

                  {row.decisionNote ? (
                    <p className="mt-1 text-sm text-ink">
                      {row.decidedBy?.name}: {row.decisionNote}
                    </p>
                  ) : null}

                  {row.status === "PENDING" && row.startDate >= today ? (
                    <form action={cancelLeaveAction} className="mt-2">
                      <input type="hidden" name="requestId" value={row.id} />
                      <Button type="submit" variant="ghost" className="text-danger-ink">
                        {t("leave.cancel")}
                      </Button>
                    </form>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
