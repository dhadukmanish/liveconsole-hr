"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/guard";
import { writeAudit } from "@/lib/audit";
import { workDateFor } from "@/lib/workday";

export type AttendanceState = { error?: string; notice?: string };

/** Today's row for a person, or null. Used by Home and the attendance page. */
export async function todayAttendance(userId: string) {
  return prisma.attendance.findUnique({
    where: { userId_workDate: { userId, workDate: workDateFor() } },
  });
}

export async function checkInAction(
  _prev: AttendanceState,
  _formData: FormData,
): Promise<AttendanceState> {
  const actor = await requirePermission("ATTENDANCE", "ADD");
  const workDate = workDateFor();

  const existing = await prisma.attendance.findUnique({
    where: { userId_workDate: { userId: actor.id, workDate } },
  });

  if (existing?.checkInAt) {
    // Not an error worth shouting about; the button just raced or was tapped twice.
    return { notice: "attendance.alreadyCheckedIn" };
  }

  await prisma.attendance.upsert({
    where: { userId_workDate: { userId: actor.id, workDate } },
    update: { checkInAt: new Date(), status: "PRESENT" },
    create: {
      userId: actor.id,
      workDate,
      checkInAt: new Date(),
      status: "PRESENT",
      recordedById: actor.id,
    },
  });

  await writeAudit({
    actorUserId: actor.id,
    action: "ATTENDANCE_CHECK_IN",
    entity: "Attendance",
    entityId: actor.id,
  });

  revalidatePath("/attendance");
  revalidatePath("/home");
  return { notice: "attendance.checkedIn" };
}

export async function checkOutAction(
  _prev: AttendanceState,
  _formData: FormData,
): Promise<AttendanceState> {
  const actor = await requirePermission("ATTENDANCE", "ADD");
  const workDate = workDateFor();

  const existing = await prisma.attendance.findUnique({
    where: { userId_workDate: { userId: actor.id, workDate } },
  });

  if (!existing?.checkInAt) return { error: "attendance.notCheckedIn" };
  if (existing.checkOutAt) return { notice: "attendance.alreadyCheckedOut" };

  const checkOutAt = new Date();
  const workedMinutes = Math.max(
    0,
    Math.round((checkOutAt.getTime() - existing.checkInAt.getTime()) / 60_000),
  );

  await prisma.attendance.update({
    where: { id: existing.id },
    data: { checkOutAt, workedMinutes },
  });

  await writeAudit({
    actorUserId: actor.id,
    action: "ATTENDANCE_CHECK_OUT",
    entity: "Attendance",
    entityId: existing.id,
    summary: `${workedMinutes} minutes`,
  });

  revalidatePath("/attendance");
  revalidatePath("/home");
  return { notice: "attendance.checkedOut" };
}
