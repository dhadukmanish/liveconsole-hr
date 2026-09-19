import { prisma } from "@/lib/prisma";
import { enqueue } from "@/lib/notify";
import { adminUsers, managerOrAdmins } from "@/lib/recipients";
import { formatDate, toDateInput, workDateFor } from "@/lib/workday";

/**
 * Shared hosting has no cron, so an external scheduler calls this once a day.
 *
 * Nothing is sent from here: every reminder is queued in the outbox, which the
 * same scheduler drains. That keeps this run short and makes a failed send
 * retryable instead of lost. Dedupe keys carry the India-local day, so a
 * scheduler that retries queues nothing twice.
 */
export type ReminderSummary = {
  dayKey: string;
  licensesChecked: number;
  leaveChecked: number;
  queued: number;
  skipped: number;
};

export async function runReminders(): Promise<ReminderSummary> {
  const today = workDateFor();
  const dayKey = toDateInput(today);
  const summary: ReminderSummary = {
    dayKey,
    licensesChecked: 0,
    leaveChecked: 0,
    queued: 0,
    skipped: 0,
  };

  const count = (result: { queued: boolean }) => {
    if (result.queued) summary.queued += 1;
    else summary.skipped += 1;
  };

  // --- licences coming up for renewal -------------------------------------
  const licenses = await prisma.license.findMany({
    where: { isActive: true },
    include: { owner: { select: { id: true, name: true, mobile: true, status: true } } },
  });

  const admins = await adminUsers();

  for (const license of licenses) {
    const days = Math.round((license.expiryDate.getTime() - today.getTime()) / 86_400_000);

    // Inside the notice window, or already expired: both are worth a nudge.
    if (days > license.remindDaysBefore) continue;
    summary.licensesChecked += 1;

    // The owner if there is one and they are still here — a renewal chased at
    // somebody who has left is a renewal nobody is chasing.
    const recipients =
      license.owner && license.owner.status === "ACTIVE"
        ? [{ id: license.owner.id, name: license.owner.name, mobile: license.owner.mobile }]
        : admins;

    for (const recipient of recipients) {
      count(
        await enqueue({
          userId: recipient.id,
          template: days < 0 ? "license_expired" : "license_expiry",
          values: {
            name: license.name,
            expiry: formatDate(license.expiryDate),
            days: Math.abs(days),
          },
          dedupeKey: `license:${license.id}:${dayKey}:${recipient.id}`,
        }),
      );
    }
  }

  // --- leave that has been waiting on someone -----------------------------
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
  const stale = await prisma.leaveRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: twoDaysAgo } },
    include: {
      user: { select: { id: true, name: true } },
      leaveType: { select: { name: true } },
    },
  });

  for (const request of stale) {
    summary.leaveChecked += 1;

    for (const recipient of await managerOrAdmins(request.userId)) {
      count(
        await enqueue({
          userId: recipient.id,
          template: "leave_pending",
          values: {
            applicant: request.user.name,
            leaveType: request.leaveType.name,
            from: formatDate(request.startDate),
          },
          dedupeKey: `leave-pending:${request.id}:${dayKey}:${recipient.id}`,
        }),
      );
    }
  }

  return summary;
}
