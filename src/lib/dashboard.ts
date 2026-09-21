import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/session";
import { visibleUserIds } from "@/lib/scope";
import { workDateFor } from "@/lib/workday";

/**
 * The numbers behind the Home screen. Separate from the reports because a
 * dashboard answers "how are things right now", not "what happened last month",
 * and the two want different windows.
 */

/** Hours worked per day over the last fortnight, for the person signed in. */
export type HoursTrend = { days: { label: string; hours: number }[]; total: number };

export async function myHoursTrend(userId: string, days = 14): Promise<HoursTrend> {
  const today = workDateFor();
  const from = new Date(today.getTime() - (days - 1) * 86_400_000);

  const rows = await prisma.attendance.findMany({
    where: { userId, workDate: { gte: from, lte: today } },
    select: { workDate: true, workedMinutes: true },
  });

  const byDate = new Map(
    rows.map((row) => [row.workDate.toISOString().slice(0, 10), row.workedMinutes ?? 0]),
  );

  const out: HoursTrend["days"] = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(from.getTime() + index * 86_400_000);
    const minutes = byDate.get(date.toISOString().slice(0, 10)) ?? 0;
    out.push({
      label: String(date.getUTCDate()),
      // One decimal: a bar labelled 7.5 is useful, 7.4833 is not.
      hours: Math.round((minutes / 60) * 10) / 10,
    });
  }

  return { days: out, total: Math.round((rows.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0) / 60) * 10) / 10 };
}

/** Where the team stands today: in, on leave, or not in yet. */
export type TeamToday = { present: number; onLeave: number; notIn: number; total: number };

export async function teamToday(actor: CurrentUser): Promise<TeamToday | null> {
  // Only meaningful for somebody who can see more than themselves.
  if (!can(actor, "ATTENDANCE", "VIEW")) return null;
  const scope = await visibleUserIds(actor);
  if (scope !== "ALL" && scope.length <= 1) return null;

  const today = workDateFor();

  const [counts, attendance, leave] = await Promise.all([
    peopleCounts(actor),
    prisma.attendance.findMany({
      where: {
        workDate: today,
        ...(scope === "ALL" ? {} : { userId: { in: scope } }),
      },
      select: { userId: true, status: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: today },
        endDate: { gte: today },
        ...(scope === "ALL" ? {} : { userId: { in: scope } }),
      },
      select: { userId: true },
    }),
  ]);

  const onLeaveIds = new Set(leave.map((row) => row.userId));
  // Somebody who checked in counts as in even if they had leave approved —
  // what actually happened beats what was planned.
  const presentIds = new Set(
    attendance.filter((row) => row.status !== "ABSENT").map((row) => row.userId),
  );
  for (const id of presentIds) onLeaveIds.delete(id);

  const present = presentIds.size;
  const onLeave = onLeaveIds.size;
  return {
    present,
    onLeave,
    notIn: Math.max(0, counts.active - present - onLeave),
    total: counts.active,
  };
}

/**
 * How many people this person can see, and how many of those are active. Two
 * separate counts is two round trips for one row of numbers, and the Home
 * screen wants both — the stat tile the first, the team chart the second.
 * Memoised so the two sections that ask do not ask twice.
 */
export const peopleCounts = cache(async function peopleCounts(
  actor: CurrentUser,
): Promise<{ total: number; active: number }> {
  const scope = await visibleUserIds(actor);
  const rows =
    scope === "ALL"
      ? await prisma.$queryRaw<{ total: bigint; active: bigint }[]>`
          SELECT count(*) AS total,
                 count(*) FILTER (WHERE status = 'ACTIVE') AS active
          FROM users
        `
      : await prisma.$queryRaw<{ total: bigint; active: bigint }[]>`
          SELECT count(*) AS total,
                 count(*) FILTER (WHERE status = 'ACTIVE') AS active
          FROM users
          WHERE id = ANY(${scope})
        `;
  return { total: Number(rows[0]?.total ?? 0), active: Number(rows[0]?.active ?? 0) };
});

/**
 * What is waiting on this person: leave they have to decide, and their own
 * requests still unanswered. The Home tile showed a dash where this number
 * belongs.
 */
export async function pendingForMe(actor: CurrentUser): Promise<number> {
  const scope = await visibleUserIds(actor);
  const decides = can(actor, "LEAVE", "APPROVE");

  // One count, not two. Both halves are "pending leave that is this person's
  // problem"; asking the database twice for that was two round trips to say
  // one number.
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count
    FROM leave_requests
    WHERE status = 'PENDING'
      AND (
        "userId" = ${actor.id}
        OR (
          ${decides}::boolean
          AND "userId" <> ${actor.id}
          AND (${scope === "ALL"}::boolean OR "userId" = ANY(${
            scope === "ALL" ? [] : scope
          }))
        )
      )
  `;
  return Number(rows[0]?.count ?? 0);
}
