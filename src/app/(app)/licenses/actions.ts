"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/guard";
import { writeAudit } from "@/lib/audit";
import { optionalText } from "@/lib/validation";
import { fromDateInput } from "@/lib/workday";

export type LicenseState = { error?: string; notice?: string };

const licenseSchema = z.object({
  name: z.string().trim().min(2, "errors.invalidInput").max(120),
  vendor: optionalText(120),
  licenseNumber: optionalText(80),
  startDate: optionalText(10),
  expiryDate: z.string().min(1, "licenses.expiryRequired"),
  cost: optionalText(20),
  ownerId: optionalText(40),
  remindDaysBefore: z.coerce.number().int().min(0).max(365).default(30),
  notes: optionalText(500),
});

export async function saveLicenseAction(
  _prev: LicenseState,
  formData: FormData,
): Promise<LicenseState> {
  const licenseId = String(formData.get("licenseId") ?? "");
  const actor = await requirePermission("LICENSES", licenseId ? "EDIT" : "ADD");

  const parsed = licenseSchema.safeParse({
    name: formData.get("name") ?? "",
    vendor: formData.get("vendor") ?? "",
    licenseNumber: formData.get("licenseNumber") ?? "",
    startDate: formData.get("startDate") ?? "",
    expiryDate: formData.get("expiryDate") ?? "",
    cost: formData.get("cost") ?? "",
    ownerId: formData.get("ownerId") ?? "",
    remindDaysBefore: formData.get("remindDaysBefore") ?? 30,
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0].message;
    return { error: message.includes(".") ? message : "errors.invalidInput" };
  }
  const input = parsed.data;

  const expiryDate = fromDateInput(input.expiryDate);
  if (!expiryDate) return { error: "errors.invalidInput" };
  const startDate = input.startDate ? fromDateInput(input.startDate) : null;
  if (startDate && startDate > expiryDate) return { error: "licenses.startAfterExpiry" };

  const cost = input.cost ? Number(input.cost) : null;
  if (cost !== null && !Number.isFinite(cost)) return { error: "errors.invalidInput" };

  const data = {
    name: input.name,
    vendor: input.vendor ?? null,
    licenseNumber: input.licenseNumber ?? null,
    startDate,
    expiryDate,
    cost,
    ownerId: input.ownerId || null,
    remindDaysBefore: input.remindDaysBefore,
    notes: input.notes ?? null,
  };

  if (licenseId) {
    await prisma.license.update({ where: { id: licenseId }, data });
  } else {
    await prisma.license.create({ data: { ...data, createdById: actor.id } });
  }

  await writeAudit({
    actorUserId: actor.id,
    action: licenseId ? "LICENSE_UPDATED" : "LICENSE_CREATED",
    entity: "License",
    entityId: licenseId || undefined,
    summary: `${input.name} → ${input.expiryDate}`,
  });

  revalidatePath("/licenses");
  return { notice: "common.saved" };
}

export async function deleteLicenseAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("LICENSES", "DELETE");
  const licenseId = String(formData.get("licenseId") ?? "");
  const existing = await prisma.license.findUnique({ where: { id: licenseId } });
  if (!existing) return;

  await prisma.license.delete({ where: { id: licenseId } });
  await writeAudit({
    actorUserId: actor.id,
    action: "LICENSE_DELETED",
    entity: "License",
    entityId: licenseId,
    summary: existing.name,
  });
  revalidatePath("/licenses");
}
