"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/guard";
import { writeAudit } from "@/lib/audit";

export type SettingsState = { error?: string; notice?: string };

export const MASTER_KINDS = [
  "documentType",
  "leaveType",
  "taskType",
  "taskPriority",
  "taskStatus",
] as const;

export type MasterKind = (typeof MASTER_KINDS)[number];

const kindSchema = z.enum(MASTER_KINDS);

const baseSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80),
  // Codes are referenced by later phases, so they are normalised, not free text.
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,30}$/, "Use 2-30 letters, numbers or underscores"),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

const colourSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #F7941D")
  .default("#6B6A65");

function checkbox(formData: FormData, name: string): boolean {
  return formData.get(name) !== null;
}

export async function createMasterAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const actor = await requirePermission("SETTINGS", "ADD");

  const kindParsed = kindSchema.safeParse(formData.get("kind"));
  if (!kindParsed.success) return { error: "errors.invalidInput" };
  const kind = kindParsed.data;

  const parsed = baseSchema.safeParse({
    name: formData.get("name") ?? "",
    code: formData.get("code") ?? "",
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, code, sortOrder } = parsed.data;

  try {
    switch (kind) {
      case "documentType":
        await prisma.documentType.create({
          data: { name, code, sortOrder, requiresNumber: checkbox(formData, "requiresNumber") },
        });
        break;
      case "leaveType": {
        const annualRaw = String(formData.get("annualDays") ?? "").trim();
        const annualDays = annualRaw === "" ? null : Number(annualRaw);
        if (annualDays !== null && (!Number.isInteger(annualDays) || annualDays < 0)) {
          return { error: "errors.invalidInput" };
        }
        await prisma.leaveType.create({
          data: {
            name,
            code,
            sortOrder,
            annualDays,
            isPaid: checkbox(formData, "isPaid"),
            requiresApproval: checkbox(formData, "requiresApproval"),
          },
        });
        break;
      }
      case "taskType":
        await prisma.taskType.create({ data: { name, code, sortOrder } });
        break;
      case "taskPriority": {
        const colour = colourSchema.safeParse(formData.get("colour") ?? "#6B6A65");
        if (!colour.success) return { error: colour.error.issues[0].message };
        await prisma.taskPriority.create({
          data: { name, code, sortOrder, colour: colour.data },
        });
        break;
      }
      case "taskStatus": {
        const colour = colourSchema.safeParse(formData.get("colour") ?? "#6B6A65");
        if (!colour.success) return { error: colour.error.issues[0].message };
        await prisma.taskStatus.create({
          data: {
            name,
            code,
            sortOrder,
            colour: colour.data,
            isTerminal: checkbox(formData, "isTerminal"),
          },
        });
        break;
      }
    }
  } catch (error) {
    // Unique violation on `code` is the common case here.
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return { error: "errors.invalidInput" };
    }
    throw error;
  }

  await writeAudit({
    actorUserId: actor.id,
    action: "MASTER_CREATED",
    entity: kind,
    summary: `${code} ${name}`,
  });

  revalidatePath("/settings");
  return { notice: "common.saved" };
}

export async function toggleMasterActiveAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("SETTINGS", "EDIT");

  const kindParsed = kindSchema.safeParse(formData.get("kind"));
  const id = String(formData.get("id") ?? "");
  const nextActive = formData.get("isActive") === "true";
  if (!kindParsed.success || !id) return;

  const data = { isActive: nextActive };
  switch (kindParsed.data) {
    case "documentType":
      await prisma.documentType.update({ where: { id }, data });
      break;
    case "leaveType":
      await prisma.leaveType.update({ where: { id }, data });
      break;
    case "taskType":
      await prisma.taskType.update({ where: { id }, data });
      break;
    case "taskPriority":
      await prisma.taskPriority.update({ where: { id }, data });
      break;
    case "taskStatus":
      await prisma.taskStatus.update({ where: { id }, data });
      break;
  }

  await writeAudit({
    actorUserId: actor.id,
    action: nextActive ? "MASTER_ACTIVATED" : "MASTER_DEACTIVATED",
    entity: kindParsed.data,
    entityId: id,
  });

  revalidatePath("/settings");
}

export async function deleteMasterAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("SETTINGS", "DELETE");

  const kindParsed = kindSchema.safeParse(formData.get("kind"));
  const id = String(formData.get("id") ?? "");
  if (!kindParsed.success || !id) return;

  // A document type with documents attached is deactivated, never deleted:
  // removing it would orphan real records.
  if (kindParsed.data === "documentType") {
    const inUse = await prisma.document.count({ where: { documentTypeId: id } });
    if (inUse > 0) {
      await prisma.documentType.update({ where: { id }, data: { isActive: false } });
      revalidatePath("/settings");
      return;
    }
    await prisma.documentType.delete({ where: { id } });
  } else if (kindParsed.data === "leaveType") {
    await prisma.leaveType.delete({ where: { id } });
  } else if (kindParsed.data === "taskType") {
    await prisma.taskType.delete({ where: { id } });
  } else if (kindParsed.data === "taskPriority") {
    await prisma.taskPriority.delete({ where: { id } });
  } else {
    await prisma.taskStatus.delete({ where: { id } });
  }

  await writeAudit({
    actorUserId: actor.id,
    action: "MASTER_DELETED",
    entity: kindParsed.data,
    entityId: id,
  });

  revalidatePath("/settings");
}
