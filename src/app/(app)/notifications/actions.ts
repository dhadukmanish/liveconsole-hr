"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdminAction } from "@/lib/auth/guard";
import { writeAudit } from "@/lib/audit";

/**
 * Puts a failed message back in the queue. Attempts reset to zero: a retry
 * asked for by a person is a fresh start, not the tail of an old one.
 */
export async function retryNotificationAction(formData: FormData): Promise<void> {
  const actor = await requireSuperAdminAction();
  const id = String(formData.get("notificationId") ?? "");

  const existing = await prisma.notification.findUnique({ where: { id } });
  // Re-queuing something already sent would send it twice.
  if (!existing || existing.status === "SENT") return;

  await prisma.notification.update({
    where: { id },
    data: { status: "QUEUED", attempts: 0, lastError: null },
  });
  await writeAudit({
    actorUserId: actor.id,
    action: "NOTIFICATION_RETRIED",
    entity: "Notification",
    entityId: id,
    summary: existing.template,
  });
  revalidatePath("/notifications");
}

/** Stops a queued message. Kept as a row, so the log still explains itself. */
export async function cancelNotificationAction(formData: FormData): Promise<void> {
  const actor = await requireSuperAdminAction();
  const id = String(formData.get("notificationId") ?? "");

  const existing = await prisma.notification.findUnique({ where: { id } });
  if (!existing || existing.status === "SENT") return;

  await prisma.notification.update({
    where: { id },
    data: { status: "CANCELLED", lastError: "stopped by an administrator" },
  });
  await writeAudit({
    actorUserId: actor.id,
    action: "NOTIFICATION_CANCELLED",
    entity: "Notification",
    entityId: id,
    summary: existing.template,
  });
  revalidatePath("/notifications");
}
