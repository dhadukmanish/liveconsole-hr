import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { NotificationStatus } from "@prisma/client";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardMuted } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { messageChannel } from "@/lib/messaging";
import { lastCronRuns } from "@/lib/cron-log";
import { formatDateTimeIst } from "@/lib/workday";
import { cancelNotificationAction, retryNotificationAction } from "./actions";

const STATUSES: NotificationStatus[] = ["QUEUED", "SENT", "FAILED", "CANCELLED"];

const TONE = {
  QUEUED: "pending",
  SENT: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
} as const;

const LABEL = {
  QUEUED: "notify.queued",
  SENT: "notify.sent",
  FAILED: "notify.failed",
  CANCELLED: "notify.cancelled",
} as const;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // Super admin only: the log holds every message sent about every person.
  await requireSuperAdmin();
  const t = await getTranslations();

  const { status } = await searchParams;
  const filter = STATUSES.find((value) => value === status);

  const [rows, counts, cronRuns] = await Promise.all([
    prisma.notification.findMany({
      where: filter ? { status: filter } : {},
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.groupBy({ by: ["status"], _count: { _all: true } }),
    lastCronRuns(),
  ]);

  // Queued messages only move when the scheduler calls, so a scheduler nobody
  // set up looks exactly like a quiet day. Say when it was last heard from.
  const flush = cronRuns.find((run) => run.name === "notifications");
  const flushAgeMinutes = flush ? (Date.now() - flush.at.getTime()) / 60_000 : null;
  const queuedCount = counts.find((row) => row.status === "QUEUED")?._count._all ?? 0;

  const countFor = (value: NotificationStatus) =>
    counts.find((row) => row.status === value)?._count._all ?? 0;

  const chip = (active: boolean) =>
    `flex min-h-12 shrink-0 items-center rounded-xl border px-4 text-sm font-semibold ${
      active ? "border-brand bg-brand text-on-brand" : "border-hairline bg-card text-ink"
    }`;

  return (
    <>
      <PageHeader
        title={t("notify.title")}
        subtitle={t("notify.count", { count: rows.length })}
      />

      {/* Nothing is actually sent until WhatsApp is configured, and a log full
          of "sent" that nobody received would be worse than saying so. */}
      {messageChannel().name === "console" ? (
        <Alert tone="warning" className="mb-4">
          {t("notify.notConfigured")}
        </Alert>
      ) : null}

      {/* The scheduler is the only thing that sends, so its silence is the most
          useful thing this screen can report. */}
      {flush === undefined ? (
        <Alert tone={queuedCount > 0 ? "danger" : "warning"} className="mb-4">
          {t("notify.schedulerNeverRan")}
        </Alert>
      ) : flushAgeMinutes !== null && flushAgeMinutes > 60 ? (
        <Alert tone={queuedCount > 0 ? "danger" : "warning"} className="mb-4">
          {t("notify.schedulerStale", { when: formatDateTimeIst(flush.at) })}
        </Alert>
      ) : (
        <Alert tone="success" className="mb-4">
          {t("notify.schedulerLastRan", { when: formatDateTimeIst(flush.at) })}
        </Alert>
      )}

      {cronRuns.length > 0 ? (
        <Card className="mb-4">
          <ul className="flex flex-col gap-1">
            {cronRuns.map((run) => (
              <li key={run.name} className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-semibold text-ink">{t(`notify.job.${run.name}` as "notify.job.backup")}</span>
                <span className="text-muted">
                  {formatDateTimeIst(run.at)}
                  {run.summary ? ` · ${run.summary}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="lc-scroll-hint -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href="/notifications" className={chip(!filter)}>
          {t("notify.all")}
        </Link>
        {STATUSES.map((value) => (
          <Link
            key={value}
            href={`/notifications?status=${value}`}
            className={chip(filter === value)}
          >
            {t(LABEL[value])} {countFor(value)}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState>{t("notify.none")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Card>
                <div className="mb-1.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">
                      {row.user?.name ?? row.toMobile}
                    </p>
                    <CardMuted className="truncate">
                      {row.toMobile} · {row.channel} · {row.template}
                    </CardMuted>
                  </div>
                  <Badge tone={TONE[row.status]} className="shrink-0">
                    {t(LABEL[row.status])}
                  </Badge>
                </div>

                <p className="text-sm text-ink">{row.body}</p>

                <CardMuted className="mt-1.5">
                  {row.sentAt
                    ? t("notify.sentAt", { when: formatDateTimeIst(row.sentAt) })
                    : t("notify.queuedAt", { when: formatDateTimeIst(row.createdAt) })}
                  {row.attempts > 0 ? ` · ${t("notify.attempts")} ${row.attempts}` : ""}
                </CardMuted>

                {row.lastError ? (
                  <p className="mt-1.5 text-sm font-medium text-danger-ink">
                    {t("notify.lastError")}: {row.lastError}
                  </p>
                ) : null}

                {row.status !== "SENT" ? (
                  <div className="mt-3 flex gap-2">
                    <form action={retryNotificationAction}>
                      <input type="hidden" name="notificationId" value={row.id} />
                      <Button type="submit" variant="secondary">
                        {t("notify.retry")}
                      </Button>
                    </form>
                    {row.status === "QUEUED" ? (
                      <form action={cancelNotificationAction}>
                        <input type="hidden" name="notificationId" value={row.id} />
                        <Button type="submit" variant="ghost" className="text-danger-ink">
                          {t("notify.cancel")}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
