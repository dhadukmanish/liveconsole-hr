import type { AttendanceStatus, LeaveStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { visibleUserIds } from "@/lib/scope";
import { formatDate, startOfMonth, toDateInput, workDateFor } from "@/lib/workday";

/**
 * The four reports, as data. Rendering happens twice — on screen and in a PDF —
 * so neither owns the numbers.
 *
 * Every one is scoped the same way as the rest of the app: an employee sees
 * themselves, an admin their team recursively, a super admin everybody. The
 * scope is applied here rather than trusted from the request, so a crafted
 * query string cannot widen it.
 */
export const REPORT_KINDS = ["attendance", "leave", "tasks", "licenses"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export function isReportKind(value: unknown): value is ReportKind {
  return typeof value === "string" && (REPORT_KINDS as readonly string[]).includes(value);
}

/** A month as "2026-09", the form the month input uses. */
export function toMonthInput(date: Date): string {
  return toDateInput(date).slice(0, 7);
}

export function monthRange(month: string): { from: Date; to: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const base = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
    : startOfMonth(workDateFor());
  // Day 0 of the next month is the last day of this one, so no month-length table.
  const to = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
  return { from: base, to };
}

export function parseDateRange(from?: string, to?: string): { from: Date; to: Date } {
  const today = workDateFor();
  // The whole current month, not "up to today": a leave register that stopped at
  // today would hide leave already approved for next week, which is exactly what
  // somebody planning the month needs to see.
  const fallbackFrom = startOfMonth(today);
  const fallbackTo = monthRange(toMonthInput(today)).to;
  const parse = (value: string | undefined, fallback: Date) =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : fallback;

  const start = parse(from, fallbackFrom);
  const end = parse(to, fallbackTo);
  // A backwards range returns nothing and looks like missing data, so swap it.
  return end < start ? { from: end, to: start } : { from: start, to: end };
}

async function scopedUsers(actor: CurrentUser) {
  const ids = await visibleUserIds(actor);
  return prisma.user.findMany({
    where: {
      ...(ids === "ALL" ? {} : { id: { in: ids } }),
      // Someone who has left still belongs in last month's register.
      status: { in: ["ACTIVE", "BLOCKED", "INACTIVE"] },
    },
    select: { id: true, name: true, profile: { select: { employeeCode: true } } },
    orderBy: { name: "asc" },
  });
}

// ---------------------------------------------------------------- attendance

/** One letter per day, which is what makes a month fit across a page. */
export const ATTENDANCE_LETTER: Record<AttendanceStatus, string> = {
  PRESENT: "P",
  HALF_DAY: "H",
  ON_LEAVE: "L",
  ABSENT: "A",
};

export type AttendanceReportRow = {
  userId: string;
  name: string;
  employeeCode: string | null;
  /** Day of month (1-based) to the letter for that day. */
  days: Record<number, string>;
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  workedMinutes: number;
};

export type AttendanceReport = {
  kind: "attendance";
  month: string;
  from: Date;
  to: Date;
  dayCount: number;
  rows: AttendanceReportRow[];
};

export async function attendanceReport(
  actor: CurrentUser,
  month: string,
): Promise<AttendanceReport> {
  const { from, to } = monthRange(month);
  const users = await scopedUsers(actor);
  const ids = users.map((user) => user.id);

  const records = ids.length
    ? await prisma.attendance.findMany({
        where: { userId: { in: ids }, workDate: { gte: from, lte: to } },
        select: { userId: true, workDate: true, status: true, workedMinutes: true },
      })
    : [];

  // Approved leave counts as leave on the register even where nobody recorded
  // an attendance row for the day — which is the normal case.
  const leave = ids.length
    ? await prisma.leaveRequest.findMany({
        where: {
          userId: { in: ids },
          status: "APPROVED",
          startDate: { lte: to },
          endDate: { gte: from },
        },
        select: { userId: true, startDate: true, endDate: true, isHalfDay: true },
      })
    : [];

  const byUser = new Map<string, AttendanceReportRow>(
    users.map((user) => [
      user.id,
      {
        userId: user.id,
        name: user.name,
        employeeCode: user.profile?.employeeCode ?? null,
        days: {},
        presentDays: 0,
        halfDays: 0,
        leaveDays: 0,
        workedMinutes: 0,
      },
    ]),
  );

  for (const request of leave) {
    const row = byUser.get(request.userId);
    if (!row) continue;
    const start = request.startDate < from ? from : request.startDate;
    const end = request.endDate > to ? to : request.endDate;
    for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      row.days[day.getUTCDate()] = ATTENDANCE_LETTER.ON_LEAVE;
      row.leaveDays += request.isHalfDay ? 0.5 : 1;
    }
  }

  // Attendance wins over leave: if somebody actually came in, that is the fact.
  for (const record of records) {
    const row = byUser.get(record.userId);
    if (!row) continue;
    row.days[record.workDate.getUTCDate()] = ATTENDANCE_LETTER[record.status];
    if (record.status === "PRESENT") row.presentDays += 1;
    if (record.status === "HALF_DAY") row.halfDays += 1;
    row.workedMinutes += record.workedMinutes ?? 0;
  }

  return {
    kind: "attendance",
    month: toMonthInput(from),
    from,
    to,
    dayCount: to.getUTCDate(),
    rows: [...byUser.values()],
  };
}

// --------------------------------------------------------------------- leave

export type LeaveReportRow = {
  id: string;
  name: string;
  typeName: string;
  from: Date;
  to: Date;
  days: number;
  status: LeaveStatus;
  decidedBy: string | null;
  note: string | null;
};

export type LeaveReport = {
  kind: "leave";
  from: Date;
  to: Date;
  rows: LeaveReportRow[];
  /** Approved days per leave type, which is the number anybody actually asks for. */
  totals: { typeName: string; days: number }[];
};

export async function leaveReport(
  actor: CurrentUser,
  from: Date,
  to: Date,
): Promise<LeaveReport> {
  const users = await scopedUsers(actor);
  const ids = users.map((user) => user.id);

  const requests = ids.length
    ? await prisma.leaveRequest.findMany({
        where: { userId: { in: ids }, startDate: { lte: to }, endDate: { gte: from } },
        include: {
          user: { select: { name: true } },
          leaveType: { select: { name: true } },
          decidedBy: { select: { name: true } },
        },
        orderBy: [{ startDate: "desc" }],
      })
    : [];

  const totals = new Map<string, number>();
  for (const request of requests) {
    if (request.status !== "APPROVED") continue;
    totals.set(
      request.leaveType.name,
      (totals.get(request.leaveType.name) ?? 0) + request.days,
    );
  }

  return {
    kind: "leave",
    from,
    to,
    rows: requests.map((request) => ({
      id: request.id,
      name: request.user.name,
      typeName: request.leaveType.name,
      from: request.startDate,
      to: request.endDate,
      days: request.days,
      status: request.status,
      decidedBy: request.decidedBy?.name ?? null,
      note: request.decisionNote,
    })),
    totals: [...totals.entries()]
      .map(([typeName, days]) => ({ typeName, days }))
      .sort((a, b) => b.days - a.days),
  };
}

// --------------------------------------------------------------------- tasks

export type TaskReportRow = {
  userId: string;
  name: string;
  open: number;
  done: number;
  overdue: number;
};

export type TaskReport = {
  kind: "tasks";
  from: Date;
  to: Date;
  rows: TaskReportRow[];
  unassigned: { open: number; done: number; overdue: number };
};

export async function taskReport(
  actor: CurrentUser,
  from: Date,
  to: Date,
): Promise<TaskReport> {
  const users = await scopedUsers(actor);
  const ids = users.map((user) => user.id);
  const today = workDateFor();

  // Raised in the window, so "what did we take on this month" has an answer.
  const tasks = await prisma.task.findMany({
    where: {
      createdAt: { gte: from, lte: new Date(to.getTime() + 86_400_000 - 1) },
      OR: [{ assigneeId: { in: ids } }, { assigneeId: null, createdById: { in: ids } }],
    },
    select: {
      assigneeId: true,
      dueDate: true,
      taskStatus: { select: { isTerminal: true } },
    },
  });

  const blank = () => ({ open: 0, done: 0, overdue: 0 });
  const byUser = new Map(users.map((user) => [user.id, { ...blank(), userId: user.id, name: user.name }]));
  const unassigned = blank();

  for (const task of tasks) {
    const bucket = task.assigneeId ? byUser.get(task.assigneeId) : unassigned;
    if (!bucket) continue;
    if (task.taskStatus.isTerminal) {
      bucket.done += 1;
    } else {
      bucket.open += 1;
      // Overdue is only meaningful for something still open.
      if (task.dueDate && task.dueDate < today) bucket.overdue += 1;
    }
  }

  return {
    kind: "tasks",
    from,
    to,
    rows: [...byUser.values()],
    unassigned,
  };
}

// ------------------------------------------------------------------ licences

export type LicenseReportRow = {
  id: string;
  name: string;
  vendor: string | null;
  licenseNumber: string | null;
  expiry: Date;
  daysLeft: number;
  ownerName: string | null;
  cost: number | null;
};

export type LicenseReport = {
  kind: "licenses";
  rows: LicenseReportRow[];
  totalCost: number;
};

/**
 * Company-wide rather than person-scoped: a licence belongs to the business,
 * and the screen behind it is already gated on LICENSES:VIEW.
 */
export async function licenseReport(): Promise<LicenseReport> {
  const today = workDateFor();
  const licenses = await prisma.license.findMany({
    where: { isActive: true },
    include: { owner: { select: { name: true } } },
    orderBy: { expiryDate: "asc" },
  });

  return {
    kind: "licenses",
    rows: licenses.map((license) => ({
      id: license.id,
      name: license.name,
      vendor: license.vendor,
      licenseNumber: license.licenseNumber,
      expiry: license.expiryDate,
      daysLeft: Math.round((license.expiryDate.getTime() - today.getTime()) / 86_400_000),
      ownerName: license.owner?.name ?? null,
      cost: license.cost,
    })),
    totalCost: licenses.reduce((sum, license) => sum + (license.cost ?? 0), 0),
  };
}

/** "1 Sep 2026 – 30 Sep 2026", for a report heading. */
export function rangeLabel(from: Date, to: Date): string {
  return `${formatDate(from)} – ${formatDate(to)}`;
}
