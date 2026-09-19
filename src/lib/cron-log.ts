import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

/**
 * "Is the scheduler actually calling us?" had no answer anywhere, which is a
 * poor state for the three jobs everything depends on: a cron job that was
 * never created, or quietly stopped, looks exactly like a quiet week.
 *
 * Each run leaves an audit row, so the Notifications screen can say when the
 * scheduler was last heard from.
 */
export type CronName = "notifications" | "reminders" | "backup";

const ENTITY = "Cron";

export async function recordCronRun(name: CronName, summary: string): Promise<void> {
  await writeAudit({
    action: `CRON_${name.toUpperCase()}`,
    entity: ENTITY,
    entityId: name,
    summary: summary.slice(0, 300),
  });
}

export type CronLastRun = { name: CronName; at: Date; summary: string | null };

/** The most recent run of each job, for the delivery log's header. */
export async function lastCronRuns(): Promise<CronLastRun[]> {
  const names: CronName[] = ["notifications", "reminders", "backup"];

  const rows = await Promise.all(
    names.map((name) =>
      prisma.auditLog.findFirst({
        where: { entity: ENTITY, entityId: name },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, summary: true },
      }),
    ),
  );

  return names.flatMap((name, index) => {
    const row = rows[index];
    return row ? [{ name, at: row.createdAt, summary: row.summary }] : [];
  });
}
