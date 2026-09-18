import { prisma } from "@/lib/prisma";
import { smsProvider } from "@/lib/sms";
import { formatDate, toDateInput, workDateFor } from "@/lib/workday";
import { ROLE_ADMIN, ROLE_SUPERADMIN } from "@/lib/rbac";

/**
 * Shared hosting has no cron, so an external scheduler calls this once a day.
 * Schedulers retry, so every send is recorded against (kind, entity, day,
 * recipient) and a repeat call sends nothing.
 */
export type ReminderSummary = {
  dayKey: string;
  licensesChecked: number;
  leaveChecked: number;
  sent: number;
  alreadySent: number;
  failures: { to: string; reason: string }[];
};

type Recipient = { name: string; mobile: string };

async function alreadySent(
  kind: "LICENSE_EXPIRY" | "LEAVE_PENDING",
  entityId: string,
  dayKey: string,
  recipient: string,
) {
  const existing = await prisma.reminderLog.findUnique({
    where: { kind_entityId_dayKey_recipient: { kind, entityId, dayKey, recipient } },
  });
  return Boolean(existing);
}

async function send(
  kind: "LICENSE_EXPIRY" | "LEAVE_PENDING",
  entityId: string,
  dayKey: string,
  to: Recipient,
  message: string,
  summary: ReminderSummary,
) {
  if (await alreadySent(kind, entityId, dayKey, to.mobile)) {
    summary.alreadySent += 1;
    return;
  }

  const provider = smsProvider();
  try {
    await provider.sendText(to.mobile, message);

    await prisma.reminderLog.create({
      data: {
        kind,
        entityId,
        dayKey,
        recipient: to.mobile,
        channel: provider.name,
        detail: message.slice(0, 200),
      },
    });
    summary.sent += 1;
  } catch (error) {
    // A failed send is not recorded, so tomorrow's run tries again.
    summary.failures.push({
      to: to.mobile,
      reason: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
  }
}

/** Admins and super admins, as a fallback when a licence has no owner. */
async function adminRecipients(): Promise<Recipient[]> {
  const admins = await prisma.user.findMany({
    where: { status: "ACTIVE", role: { code: { in: [ROLE_SUPERADMIN, ROLE_ADMIN] } } },
    select: { name: true, mobile: true },
  });
  return admins;
}

export async function runReminders(): Promise<ReminderSummary> {
  const today = workDateFor();
  const dayKey = toDateInput(today);
  const summary: ReminderSummary = {
    dayKey,
    licensesChecked: 0,
    leaveChecked: 0,
    sent: 0,
    alreadySent: 0,
    failures: [],
  };

  // --- licences coming up for renewal -------------------------------------
  const licenses = await prisma.license.findMany({
    where: { isActive: true },
    include: { owner: { select: { name: true, mobile: true } } },
  });

  const admins = await adminRecipients();

  for (const license of licenses) {
    const days = Math.round(
      (license.expiryDate.getTime() - today.getTime()) / 86_400_000,
    );

    // Inside the notice window, or already expired: both are worth a nudge.
    if (days > license.remindDaysBefore) continue;
    summary.licensesChecked += 1;

    const when =
      days < 0
        ? `expired ${Math.abs(days)} day(s) ago`
        : days === 0
          ? "expires today"
          : `expires in ${days} day(s)`;
    const message = `Reminder: ${license.name} ${when} (${formatDate(license.expiryDate)}).`;

    // The owner if there is one, otherwise whoever can act on it.
    const recipients = license.owner ? [license.owner] : admins;
    for (const recipient of recipients) {
      await send("LICENSE_EXPIRY", license.id, dayKey, recipient, message, summary);
    }
  }

  // --- leave that has been waiting on someone -----------------------------
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
  const stale = await prisma.leaveRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: twoDaysAgo } },
    include: {
      user: { select: { name: true, managerId: true } },
      leaveType: { select: { name: true } },
    },
  });

  for (const request of stale) {
    summary.leaveChecked += 1;

    const manager = request.user.managerId
      ? await prisma.user.findUnique({
          where: { id: request.user.managerId },
          select: { name: true, mobile: true, status: true },
        })
      : null;

    const recipients =
      manager && manager.status === "ACTIVE"
        ? [{ name: manager.name, mobile: manager.mobile }]
        : admins;

    const message =
      `Reminder: ${request.user.name}'s ${request.leaveType.name} request ` +
      `from ${formatDate(request.startDate)} is still waiting for approval.`;

    for (const recipient of recipients) {
      await send("LEAVE_PENDING", request.id, dayKey, recipient, message, summary);
    }
  }

  return summary;
}
