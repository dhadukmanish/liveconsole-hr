import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import type { PermissionAction, PermissionModule } from "@prisma/client";
import { can, getCurrentUser } from "@/lib/auth/session";
import { buildReportPdf } from "@/lib/report-pdf";
import {
  attendanceSpec,
  leaveSpec,
  licenseSpec,
  taskSpec,
  type SpecLabels,
} from "@/lib/report-spec";
import {
  attendanceReport,
  isReportKind,
  leaveReport,
  licenseReport,
  parseDateRange,
  taskReport,
  toMonthInput,
  type ReportKind,
} from "@/lib/reports";
import { formatDateTimeIst, workDateFor } from "@/lib/workday";

/**
 * The PDF of whatever the screen is showing. Scope is re-derived from the
 * session inside the report functions, so a guessed query string cannot widen
 * what somebody downloads.
 */
export const dynamic = "force-dynamic";

const MODULE: Record<ReportKind, PermissionModule> = {
  attendance: "ATTENDANCE",
  leave: "LEAVE",
  tasks: "TASK",
  licenses: "LICENSES",
};

const VIEW: PermissionAction = "VIEW";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });

  const { kind } = await params;
  if (!isReportKind(kind)) return new NextResponse("Not found", { status: 404 });
  if (!can(actor, MODULE[kind], VIEW)) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const t = await getTranslations();
  const footer = t("reports.generatedBy", { name: actor.name });
  const stamp = formatDateTimeIst(new Date());

  const labels = (prefix: string, extra: SpecLabels = {}): SpecLabels => ({
    ...extra,
    footer: `${footer}  ·  ${stamp}`,
    empty: t("reports.empty"),
    title: t(`reports.${prefix}.title` as "reports.leave.title"),
  });

  let spec;
  let filename;

  if (kind === "attendance") {
    const month = url.searchParams.get("month") ?? toMonthInput(workDateFor());
    const report = await attendanceReport(actor, month);
    spec = attendanceSpec(report, {
      ...labels("attendance", {
        name: t("reports.attendance.name"),
        code: t("reports.attendance.code"),
        presentDays: t("reports.attendance.presentDays"),
        leaveDays: t("reports.attendance.leaveDays"),
        hours: t("reports.attendance.hours"),
        present: t("reports.attendance.present"),
        halfDay: t("reports.attendance.halfDay"),
        onLeave: t("reports.attendance.onLeave"),
        absent: t("reports.attendance.absent"),
      }),
    });
    filename = `attendance-${report.month}.pdf`;
  } else if (kind === "leave") {
    const { from, to } = parseDateRange(
      url.searchParams.get("from") ?? undefined,
      url.searchParams.get("to") ?? undefined,
    );
    const report = await leaveReport(actor, from, to);
    spec = leaveSpec(report, {
      ...labels("leave", {
        name: t("reports.leave.name"),
        type: t("reports.leave.type"),
        from: t("reports.leave.from"),
        to: t("reports.leave.to"),
        days: t("reports.leave.days"),
        status: t("reports.leave.status"),
        decidedBy: t("reports.leave.decidedBy"),
        approvedTotal: t("reports.leave.approvedTotal"),
        status_PENDING: t("leave.status.PENDING"),
        status_APPROVED: t("leave.status.APPROVED"),
        status_REJECTED: t("leave.status.REJECTED"),
        status_CANCELLED: t("leave.status.CANCELLED"),
      }),
    });
    filename = `leave-${report.from.toISOString().slice(0, 10)}.pdf`;
  } else if (kind === "tasks") {
    const { from, to } = parseDateRange(
      url.searchParams.get("from") ?? undefined,
      url.searchParams.get("to") ?? undefined,
    );
    const report = await taskReport(actor, from, to);
    spec = taskSpec(report, {
      ...labels("tasks", {
        name: t("reports.tasks.name"),
        open: t("reports.tasks.open"),
        done: t("reports.tasks.done"),
        overdue: t("reports.tasks.overdue"),
        unassigned: t("reports.tasks.unassigned"),
        total: t("reports.tasks.total"),
      }),
    });
    filename = `tasks-${report.from.toISOString().slice(0, 10)}.pdf`;
  } else {
    const report = await licenseReport();
    spec = licenseSpec(report, {
      ...labels("licenses", {
        name: t("reports.licenses.name"),
        vendor: t("reports.licenses.vendor"),
        number: t("reports.licenses.number"),
        expiry: t("reports.licenses.expiry"),
        daysLeft: t("reports.licenses.daysLeft"),
        owner: t("reports.licenses.owner"),
        cost: t("reports.licenses.cost"),
        expired: t("reports.licenses.expired"),
        total: t("reports.licenses.total"),
        asAt: t("reports.licenses.asAt"),
      }),
    });
    filename = "licences.pdf";
  }

  const pdf = await buildReportPdf(spec);

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A report is somebody's record; no shared cache should hold it.
      "Cache-Control": "private, no-store",
    },
  });
}
