"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/guard";
import { writeAudit } from "@/lib/audit";
import { canSeeUser } from "@/lib/scope";
import { fromDateInput, inclusiveDayCount, workDateFor } from "@/lib/workday";

export type LeaveState = { error?: string; notice?: string };

const applySchema = z.object({
  leaveTypeId: z.string().min(1, "leave.pickType"),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().trim().min(5, "leave.reasonTooShort").max(500),
  isHalfDay: z.boolean(),
});

export async function applyLeaveAction(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const actor = await requirePermission("LEAVE", "ADD");

  const parsed = applySchema.safeParse({
    leaveTypeId: formData.get("leaveTypeId") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    reason: formData.get("reason") ?? "",
    isHalfDay: formData.get("isHalfDay") !== null,
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0].message;
    return { error: message.includes(".") ? message : "errors.invalidInput" };
  }

  const start = fromDateInput(parsed.data.startDate);
  const end = fromDateInput(parsed.data.endDate);
  if (!start || !end) return { error: "errors.invalidInput" };
  if (end < start) return { error: "leave.endBeforeStart" };

  const leaveType = await prisma.leaveType.findUnique({
    where: { id: parsed.data.leaveTypeId },
  });
  if (!leaveType || !leaveType.isActive) return { error: "leave.pickType" };

  const dayCount = inclusiveDayCount(start, end);
  // Half days only make sense for a single-day request.
  const isHalfDay = parsed.data.isHalfDay && dayCount === 1;
  const days = isHalfDay ? 0.5 : dayCount;

  // Overlapping requests are the most common data mess in leave systems, so
  // they are refused rather than silently stacked.
  const clash = await prisma.leaveRequest.findFirst({
    where: {
      userId: actor.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });
  if (clash) return { error: "leave.overlaps" };

  const created = await prisma.leaveRequest.create({
    data: {
      userId: actor.id,
      leaveTypeId: leaveType.id,
      startDate: start,
      endDate: end,
      isHalfDay,
      days,
      reason: parsed.data.reason,
      // A type that needs no approval is granted on the spot.
      status: leaveType.requiresApproval ? "PENDING" : "APPROVED",
    },
  });

  await writeAudit({
    actorUserId: actor.id,
    action: "LEAVE_APPLIED",
    entity: "LeaveRequest",
    entityId: created.id,
    summary: `${leaveType.code} ${days}d`,
  });

  revalidatePath("/leave");
  return { notice: "leave.applied" };
}

const decisionSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
});

export async function decideLeaveAction(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const actor = await requirePermission("LEAVE", "APPROVE");

  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId") ?? "",
    decision: formData.get("decision") ?? "",
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: "errors.invalidInput" };

  const request = await prisma.leaveRequest.findUnique({
    where: { id: parsed.data.requestId },
  });
  if (!request) return { error: "errors.notFound" };
  if (request.status !== "PENDING") return { error: "leave.alreadyDecided" };

  // Approving your own leave defeats the point of approval.
  if (request.userId === actor.id) return { error: "leave.cannotDecideOwn" };
  if (!(await canSeeUser(actor, request.userId))) return { error: "errors.forbidden" };

  await prisma.leaveRequest.update({
    where: { id: request.id },
    data: {
      status: parsed.data.decision,
      decidedById: actor.id,
      decidedAt: new Date(),
      decisionNote: parsed.data.note || null,
    },
  });

  await writeAudit({
    actorUserId: actor.id,
    action: `LEAVE_${parsed.data.decision}`,
    entity: "LeaveRequest",
    entityId: request.id,
  });

  revalidatePath("/leave");
  return { notice: parsed.data.decision === "APPROVED" ? "leave.approved" : "leave.rejected" };
}

export async function cancelLeaveAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("LEAVE", "ADD");
  const requestId = String(formData.get("requestId") ?? "");

  const request = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
  if (!request || request.userId !== actor.id) return;
  // Only a request that has not been decided, and has not already started.
  if (request.status !== "PENDING" || request.startDate < workDateFor()) return;

  await prisma.leaveRequest.update({
    where: { id: request.id },
    data: { status: "CANCELLED" },
  });

  await writeAudit({
    actorUserId: actor.id,
    action: "LEAVE_CANCELLED",
    entity: "LeaveRequest",
    entityId: request.id,
  });

  revalidatePath("/leave");
}
