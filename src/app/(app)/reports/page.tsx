import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import type { PermissionModule } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardMuted } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { ReportChart } from "@/components/report-chart";
import {
  attendanceChart,
  leaveChart,
  licenseChart,
  taskChart,
} from "@/lib/chart-model";
import { requireUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { ROLE_ADMIN, ROLE_SUPERADMIN } from "@/lib/rbac";
import {
  attendanceReport,
  isReportKind,
  leaveReport,
  licenseReport,
  parseDateRange,
  rangeLabel,
  taskReport,
  toMonthInput,
  type ReportKind,
} from "@/lib/reports";
import { formatDate, minutesToHours, toDateInput, workDateFor } from "@/lib/workday";

const MODULE: Record<ReportKind, PermissionModule> = {
  attendance: "ATTENDANCE",
  leave: "LEAVE",
  tasks: "TASK",
  licenses: "LICENSES",
};

const STATUS_TONE = {
  PENDING: "pending",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
} as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; month?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const t = await getTranslations();
  const params = await searchParams;

  // Only offer reports the person can actually see the underlying data for.
  const available = (Object.keys(MODULE) as ReportKind[]).filter((kind) =>
    can(user, MODULE[kind], "VIEW"),
  );
  if (available.length === 0) {
    return (
      <>
        <PageHeader title={t("reports.title")} />
        <EmptyState>{t("errors.forbidden")}</EmptyState>
      </>
    );
  }

  const kind: ReportKind =
    isReportKind(params.kind) && available.includes(params.kind) ? params.kind : available[0];

  const today = workDateFor();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? (params.month as string)
    : toMonthInput(today);
  const { from, to } = parseDateRange(params.from, params.to);

  const scopeLabel =
    user.roleCode === ROLE_SUPERADMIN
      ? t("reports.scopeAll")
      : user.roleCode === ROLE_ADMIN
        ? t("reports.scopeTeam")
        : t("reports.scopeOwn");

  const downloadQuery =
    kind === "attendance"
      ? `?month=${month}`
      : kind === "licenses"
        ? ""
        : `?from=${toDateInput(from)}&to=${toDateInput(to)}`;

  return (
    <>
      <PageHeader
        title={t("reports.title")}
        subtitle={scopeLabel}
        action={
          <Link
            href={`/api/reports/${kind}${downloadQuery}`}
            className={buttonVariants({ variant: "primary" })}
            // A PDF is a download, not a page; keep the report on screen behind it.
            target="_blank"
            rel="noreferrer"
          >
            <Download className="h-5 w-5" aria-hidden />
            {t("reports.download")}
          </Link>
        }
      />

      {/* A GET form: the chosen report and period live in the URL, so a link to
          "September attendance" is a link somebody can send. */}
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3">
          <div className="basis-full sm:basis-auto sm:min-w-[10rem] sm:flex-1">
            <Label htmlFor="kind">{t("reports.pick")}</Label>
            <Select id="kind" name="kind" defaultValue={kind}>
              {available.map((value) => (
                <option key={value} value={value}>
                  {t(`reports.${value}.title` as "reports.leave.title")}
                </option>
              ))}
            </Select>
          </div>

          {kind === "attendance" ? (
            <div className="basis-full sm:basis-auto sm:min-w-[9rem] sm:flex-1">
              <Label htmlFor="month">{t("reports.month")}</Label>
              <Input id="month" name="month" type="month" defaultValue={month} />
            </div>
          ) : null}

          {kind === "leave" || kind === "tasks" ? (
            <>
              <div className="basis-full sm:basis-auto sm:min-w-[9rem] sm:flex-1">
                <Label htmlFor="from">{t("reports.from")}</Label>
                <Input id="from" name="from" type="date" defaultValue={toDateInput(from)} />
              </div>
              <div className="basis-full sm:basis-auto sm:min-w-[9rem] sm:flex-1">
                <Label htmlFor="to">{t("reports.to")}</Label>
                <Input id="to" name="to" type="date" defaultValue={toDateInput(to)} />
              </div>
            </>
          ) : null}

          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            {t("reports.show")}
          </button>
        </form>
      </Card>

      {kind === "attendance" ? <AttendanceTable user={user} month={month} /> : null}
      {kind === "leave" ? <LeaveTable user={user} from={from} to={to} /> : null}
      {kind === "tasks" ? <TaskTable user={user} from={from} to={to} /> : null}
      {kind === "licenses" ? <LicenseTable /> : null}
    </>
  );
}

type Actor = Awaited<ReturnType<typeof requireUser>>;

/**
 * The register is a wide grid, so on a phone it scrolls sideways with the name
 * column pinned — a month of days cannot be made to fit 390px, and shrinking it
 * to fit would make it unreadable.
 */
async function AttendanceTable({ user, month }: { user: Actor; month: string }) {
  const t = await getTranslations();
  const report = await attendanceReport(user, month);
  if (report.rows.length === 0) return <EmptyState>{t("reports.empty")}</EmptyState>;

  const days = Array.from({ length: report.dayCount }, (_, index) => index + 1);
  const chart = attendanceChart(report, {
    present: t("reports.attendance.present"),
    halfDay: t("reports.attendance.halfDay"),
    onLeave: t("reports.attendance.onLeave"),
    absent: t("reports.attendance.absent"),
    other: t("reports.others"),
  });

  return (
    <>
      <ReportChart model={chart} title={t("reports.chart")} />
      <CardMuted className="mb-2">
        {rangeLabel(report.from, report.to)} · P {t("reports.attendance.present")} · H{" "}
        {t("reports.attendance.halfDay")} · L {t("reports.attendance.onLeave")} · A{" "}
        {t("reports.attendance.absent")}
      </CardMuted>

      <div className="-mx-4 overflow-x-auto px-4">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="sticky left-0 bg-page py-2 pr-3 font-bold text-ink">
                {t("reports.attendance.name")}
              </th>
              {days.map((day) => (
                <th key={day} className="w-7 px-1 py-2 text-center font-semibold text-muted">
                  {day}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-bold text-ink">
                {t("reports.attendance.presentDays")}
              </th>
              <th className="px-2 py-2 text-right font-bold text-ink">
                {t("reports.attendance.hours")}
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.userId} className="border-b border-hairline/60">
                <th
                  scope="row"
                  className="sticky left-0 whitespace-nowrap bg-page py-2 pr-3 text-left font-semibold text-ink"
                >
                  {row.name}
                </th>
                {days.map((day) => (
                  <td key={day} className="px-1 py-2 text-center text-muted">
                    {row.days[day] ?? "·"}
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-semibold text-ink">
                  {row.presentDays + row.halfDays * 0.5}
                </td>
                <td className="px-2 py-2 text-right text-muted">
                  {row.workedMinutes > 0 ? minutesToHours(row.workedMinutes) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function LeaveTable({ user, from, to }: { user: Actor; from: Date; to: Date }) {
  const t = await getTranslations();
  const report = await leaveReport(user, from, to);
  if (report.rows.length === 0) return <EmptyState>{t("reports.empty")}</EmptyState>;

  return (
    <>
      <ReportChart
        model={leaveChart(report, t("reports.leave.approvedTotal"))}
        title={t("reports.chart")}
      />

      {report.totals.length > 0 ? (
        <Card className="mb-3 flex flex-wrap gap-2">
          {report.totals.map((total) => (
            <Badge key={total.typeName} tone="brand">
              {total.typeName}: {total.days}
            </Badge>
          ))}
        </Card>
      ) : null}

      <ul className="flex flex-col gap-2">
        {report.rows.map((row) => (
          <li key={row.id}>
            <Card className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{row.name}</p>
                <CardMuted className="truncate">
                  {row.typeName} · {formatDate(row.from)} – {formatDate(row.to)} ·{" "}
                  {t("leave.dayCount", { days: row.days })}
                </CardMuted>
                {row.decidedBy ? (
                  <CardMuted className="truncate">
                    {t("reports.leave.decidedBy")}: {row.decidedBy}
                    {row.note ? ` · ${row.note}` : ""}
                  </CardMuted>
                ) : null}
              </div>
              <Badge tone={STATUS_TONE[row.status]} className="shrink-0">
                {t(`leave.status.${row.status}` as "leave.status.PENDING")}
              </Badge>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

async function TaskTable({ user, from, to }: { user: Actor; from: Date; to: Date }) {
  const t = await getTranslations();
  const report = await taskReport(user, from, to);
  const rows = [
    ...report.rows,
    ...(report.unassigned.open + report.unassigned.done + report.unassigned.overdue > 0
      ? [{ userId: "unassigned", name: t("reports.tasks.unassigned"), ...report.unassigned }]
      : []),
  ].filter((row) => row.open + row.done + row.overdue > 0);

  if (rows.length === 0) return <EmptyState>{t("reports.empty")}</EmptyState>;

  const chart = taskChart(report, {
    done: t("reports.tasks.done"),
    open: t("reports.tasks.open"),
    overdue: t("reports.tasks.overdue"),
    unassigned: t("reports.tasks.unassigned"),
    other: t("reports.others"),
  });

  return (
    <>
      <ReportChart model={chart} title={t("reports.chart")} />

    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.userId}>
          <Card className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-bold text-ink">{row.name}</p>
            <div className="flex shrink-0 gap-2">
              <Badge tone="pending">
                {t("reports.tasks.open")} {row.open}
              </Badge>
              <Badge tone="success">
                {t("reports.tasks.done")} {row.done}
              </Badge>
              {row.overdue > 0 ? (
                <Badge tone="danger">
                  {t("reports.tasks.overdue")} {row.overdue}
                </Badge>
              ) : null}
            </div>
          </Card>
        </li>
      ))}
    </ul>
    </>
  );
}

async function LicenseTable() {
  const t = await getTranslations();
  const report = await licenseReport();
  if (report.rows.length === 0) return <EmptyState>{t("reports.empty")}</EmptyState>;

  const chart = licenseChart(report, t("reports.licenses.dueByMonth"), (date) =>
    new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(date),
  );

  return (
    <>
      <ReportChart model={chart} title={t("reports.licenses.dueByMonth")} />

    <ul className="flex flex-col gap-2">
      {report.rows.map((row) => (
        <li key={row.id}>
          <Card className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{row.name}</p>
              <CardMuted className="truncate">
                {[row.vendor, row.licenseNumber, row.ownerName].filter(Boolean).join(" · ") || "—"}
              </CardMuted>
              <CardMuted>{formatDate(row.expiry)}</CardMuted>
            </div>
            <Badge tone={row.daysLeft < 0 ? "danger" : row.daysLeft <= 30 ? "pending" : "success"}>
              {row.daysLeft < 0 ? t("reports.licenses.expired") : `${row.daysLeft}d`}
            </Badge>
          </Card>
        </li>
      ))}
    </ul>
    </>
  );
}
