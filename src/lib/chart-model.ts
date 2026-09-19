import type {
  AttendanceReport,
  LeaveReport,
  LicenseReport,
  TaskReport,
} from "@/lib/reports";

/**
 * A chart, as data. The SVG on screen and the drawing in the PDF both read this,
 * for the same reason the tables do: two renderers that each decide what to plot
 * will eventually plot different things.
 *
 * Only two shapes, both bars. That is not a limitation dodged — it is the form
 * these four reports actually call for: three of them are part-to-whole per
 * person (horizontal, because names are long), and one is a count per month.
 */
export type ChartSeries = {
  label: string;
  /** Index into the validated categorical order, or "seq" for a one-hue chart. */
  slot: 1 | 2 | 3 | 4 | "seq";
};

export type ChartRow = {
  label: string;
  /** One value per series, in series order. */
  values: number[];
};

export type ChartModel = {
  /** Stacked horizontal bars, or vertical columns for a count over time. */
  shape: "stacked" | "columns";
  series: ChartSeries[];
  rows: ChartRow[];
  /** The largest row total, for the axis. Zero means there is nothing to draw. */
  max: number;
  /** Shown instead of a legend when there is one series; the title says the rest. */
  caption?: string;
};

function withMax(model: Omit<ChartModel, "max">): ChartModel {
  const max = model.rows.reduce(
    (best, row) => Math.max(best, row.values.reduce((sum, value) => sum + value, 0)),
    0,
  );
  return { ...model, max };
}

/** Rows with nothing in them are noise on a chart; the table still lists them. */
function nonEmpty(rows: ChartRow[]): ChartRow[] {
  return rows.filter((row) => row.values.some((value) => value > 0));
}

/**
 * How many people are in a chart before it stops being readable. Past this the
 * bars are thinner than the gap between them, so the tail folds into one row
 * rather than being dropped — a chart that silently omits people is worse than
 * one that says "and 12 others".
 */
const MAX_ROWS = 12;

function fold(rows: ChartRow[], otherLabel: string): ChartRow[] {
  if (rows.length <= MAX_ROWS) return rows;
  const kept = rows.slice(0, MAX_ROWS - 1);
  const rest = rows.slice(MAX_ROWS - 1);
  const totals = rest[0].values.map((_, index) =>
    rest.reduce((sum, row) => sum + row.values[index], 0),
  );
  return [...kept, { label: `${otherLabel} (${rest.length})`, values: totals }];
}

export function attendanceChart(
  report: AttendanceReport,
  labels: { present: string; halfDay: string; onLeave: string; absent: string; other: string },
): ChartModel {
  const rows = nonEmpty(
    report.rows.map((row) => ({
      label: row.name,
      values: [
        row.presentDays,
        row.halfDays,
        row.leaveDays,
        // Absences are not counted in the report row, so derive them from the grid.
        Object.values(row.days).filter((letter) => letter === "A").length,
      ],
    })),
  );

  return withMax({
    shape: "stacked",
    series: [
      { label: labels.present, slot: 1 },
      { label: labels.halfDay, slot: 2 },
      { label: labels.onLeave, slot: 3 },
      { label: labels.absent, slot: 4 },
    ],
    // Most days first: the register is sorted by name, but a chart's job is
    // comparison, and comparison wants an order.
    rows: fold(
      [...rows].sort(
        (a, b) =>
          b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0),
      ),
      labels.other,
    ),
  });
}

export function leaveChart(report: LeaveReport, label: string): ChartModel {
  return withMax({
    shape: "stacked",
    series: [{ label, slot: "seq" }],
    rows: report.totals.map((total) => ({
      label: total.typeName,
      values: [total.days],
    })),
    caption: label,
  });
}

export function taskChart(
  report: TaskReport,
  labels: { done: string; open: string; overdue: string; unassigned: string; other: string },
): ChartModel {
  const rows = nonEmpty([
    ...report.rows.map((row) => ({
      label: row.name,
      // Done, open, overdue — with open between the other two on purpose: green
      // beside red is the one pair in this palette that protanopia struggles
      // with, and putting blue between them clears the check outright.
      values: [row.done, row.open, row.overdue],
    })),
    {
      label: labels.unassigned,
      values: [report.unassigned.done, report.unassigned.open, report.unassigned.overdue],
    },
  ]);

  return withMax({
    shape: "stacked",
    series: [
      { label: labels.done, slot: 1 },
      { label: labels.open, slot: 3 },
      { label: labels.overdue, slot: 4 },
    ],
    rows: fold(
      [...rows].sort(
        (a, b) =>
          b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0),
      ),
      labels.other,
    ),
  });
}

/**
 * Licences by the month they expire, for the next twelve. A bar per licence
 * showing days-left would put negative numbers on a magnitude chart; what
 * somebody planning renewals actually wants is "how many fall due in November".
 */
export function licenseChart(
  report: LicenseReport,
  label: string,
  monthName: (date: Date) => string,
): ChartModel {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    return {
      label: monthName(month),
      values: [
        report.rows.filter((row) => row.expiry >= month && row.expiry < next).length,
      ],
    };
  });

  return withMax({
    shape: "columns",
    series: [{ label, slot: "seq" }],
    rows: months,
    caption: label,
  });
}
