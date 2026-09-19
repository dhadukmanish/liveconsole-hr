import type { TableSpec } from "@/lib/report-pdf";
import type {
  AttendanceReport,
  LeaveReport,
  LicenseReport,
  TaskReport,
} from "@/lib/reports";
import { rangeLabel } from "@/lib/reports";
import { formatDate, minutesToHours } from "@/lib/workday";

/**
 * Turns a report into columns and cells once, so the screen and the PDF can
 * never disagree about what the report says.
 *
 * Labels come in from the caller rather than being looked up here: this runs in
 * a route handler as well as a page, and the person downloading has their own
 * language.
 */
export type SpecLabels = Record<string, string>;

export function attendanceSpec(report: AttendanceReport, labels: SpecLabels): TableSpec {
  const dayColumns = Array.from({ length: report.dayCount }, (_, index) => ({
    header: String(index + 1),
    width: 15,
    align: "center" as const,
  }));

  return {
    title: labels.title,
    subtitle: `${rangeLabel(report.from, report.to)}  ·  P ${labels.present} · H ${labels.halfDay} · L ${labels.onLeave} · A ${labels.absent}`,
    orientation: "landscape",
    columns: [
      { header: labels.name, width: 110 },
      { header: labels.code, width: 55 },
      ...dayColumns,
      { header: labels.presentDays, width: 34, align: "right" },
      { header: labels.leaveDays, width: 30, align: "right" },
      { header: labels.hours, width: 44, align: "right" },
    ],
    rows: report.rows.map((row) => [
      row.name,
      row.employeeCode ?? "—",
      ...Array.from({ length: report.dayCount }, (_, index) => row.days[index + 1] ?? ""),
      // Half days are worth half a day, which is the whole point of recording them.
      String(row.presentDays + row.halfDays * 0.5),
      String(row.leaveDays),
      row.workedMinutes > 0 ? minutesToHours(row.workedMinutes) : "—",
    ]),
    emptyText: labels.empty,
    footer: labels.footer,
  };
}

export function leaveSpec(report: LeaveReport, labels: SpecLabels): TableSpec {
  return {
    title: labels.title,
    subtitle: rangeLabel(report.from, report.to),
    columns: [
      { header: labels.name, width: 110 },
      { header: labels.type, width: 85 },
      { header: labels.from, width: 75 },
      { header: labels.to, width: 75 },
      { header: labels.days, width: 34, align: "right" },
      { header: labels.status, width: 60 },
      { header: labels.decidedBy, width: 84 },
    ],
    rows: report.rows.map((row) => [
      row.name,
      row.typeName,
      formatDate(row.from),
      formatDate(row.to),
      String(row.days),
      labels[`status_${row.status}`] ?? row.status,
      row.decidedBy ?? "—",
    ]),
    totals: report.totals.length
      ? [
          labels.approvedTotal,
          report.totals.map((total) => `${total.typeName} ${total.days}`).join(", "),
          "",
          "",
          String(report.totals.reduce((sum, total) => sum + total.days, 0)),
          "",
          "",
        ]
      : undefined,
    emptyText: labels.empty,
    footer: labels.footer,
  };
}

export function taskSpec(report: TaskReport, labels: SpecLabels): TableSpec {
  const rows = report.rows.map((row) => [
    row.name,
    String(row.open),
    String(row.done),
    String(row.overdue),
  ]);

  // Only worth a line when there is something in it.
  const { open, done, overdue } = report.unassigned;
  if (open + done + overdue > 0) {
    rows.push([labels.unassigned, String(open), String(done), String(overdue)]);
  }

  const sum = (pick: (row: TaskReport["rows"][number]) => number) =>
    report.rows.reduce((total, row) => total + pick(row), 0);

  return {
    title: labels.title,
    subtitle: rangeLabel(report.from, report.to),
    columns: [
      { header: labels.name, width: 200 },
      { header: labels.open, width: 80, align: "right" },
      { header: labels.done, width: 80, align: "right" },
      { header: labels.overdue, width: 80, align: "right" },
    ],
    rows,
    totals: [
      labels.total,
      String(sum((row) => row.open) + open),
      String(sum((row) => row.done) + done),
      String(sum((row) => row.overdue) + overdue),
    ],
    emptyText: labels.empty,
    footer: labels.footer,
  };
}

export function licenseSpec(report: LicenseReport, labels: SpecLabels): TableSpec {
  return {
    title: labels.title,
    subtitle: labels.asAt,
    columns: [
      { header: labels.name, width: 130 },
      { header: labels.vendor, width: 90 },
      { header: labels.number, width: 90 },
      { header: labels.expiry, width: 75 },
      { header: labels.daysLeft, width: 50, align: "right" },
      { header: labels.owner, width: 84 },
      { header: labels.cost, width: 55, align: "right" },
    ],
    rows: report.rows.map((row) => [
      row.name,
      row.vendor ?? "—",
      row.licenseNumber ?? "—",
      formatDate(row.expiry),
      // A negative count reads as nonsense; say it has passed.
      row.daysLeft < 0 ? labels.expired : String(row.daysLeft),
      row.ownerName ?? "—",
      row.cost === null ? "—" : row.cost.toFixed(2),
    ]),
    totals: ["", "", "", "", "", labels.total, report.totalCost.toFixed(2)],
    emptyText: labels.empty,
    footer: labels.footer,
  };
}
