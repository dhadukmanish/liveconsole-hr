"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/guard";
import { writeAudit } from "@/lib/audit";
import { optionalText } from "@/lib/validation";

export type ContactState = { error?: string; notice?: string };

const contactSchema = z.object({
  name: z.string().trim().min(2, "errors.invalidInput").max(120),
  // Deliberately looser than the login mobile rule: a phone book holds
  // landlines, extensions and foreign numbers too.
  phone: z.string().trim().min(5, "phonebook.badPhone").max(30),
  altPhone: optionalText(30),
  company: optionalText(120),
  designation: optionalText(80),
  email: optionalText(160),
  category: optionalText(60),
  address: optionalText(300),
  notes: optionalText(500),
});

function readForm(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    altPhone: formData.get("altPhone") ?? "",
    company: formData.get("company") ?? "",
    designation: formData.get("designation") ?? "",
    email: formData.get("email") ?? "",
    category: formData.get("category") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
  };
}

export async function saveContactAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const contactId = String(formData.get("contactId") ?? "");
  const actor = await requirePermission("PHONEBOOK", contactId ? "EDIT" : "ADD");

  const parsed = contactSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    const message = parsed.error.issues[0].message;
    return { error: message.includes(".") ? message : "errors.invalidInput" };
  }
  const input = parsed.data;

  const data = {
    name: input.name,
    phone: input.phone,
    altPhone: input.altPhone ?? null,
    company: input.company ?? null,
    designation: input.designation ?? null,
    email: input.email ?? null,
    category: input.category ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
  };

  if (contactId) {
    await prisma.contact.update({ where: { id: contactId }, data });
  } else {
    await prisma.contact.create({ data: { ...data, createdById: actor.id } });
  }

  await writeAudit({
    actorUserId: actor.id,
    action: contactId ? "CONTACT_UPDATED" : "CONTACT_CREATED",
    entity: "Contact",
    entityId: contactId || undefined,
    summary: input.name,
  });

  revalidatePath("/phonebook");
  return { notice: "common.saved" };
}

export async function deleteContactAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("PHONEBOOK", "DELETE");
  const contactId = String(formData.get("contactId") ?? "");
  const existing = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!existing) return;

  await prisma.contact.delete({ where: { id: contactId } });
  await writeAudit({
    actorUserId: actor.id,
    action: "CONTACT_DELETED",
    entity: "Contact",
    entityId: contactId,
    summary: existing.name,
  });
  revalidatePath("/phonebook");
}
