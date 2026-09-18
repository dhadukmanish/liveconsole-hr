"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/guard";
import { writeAudit } from "@/lib/audit";
import { canSeeUser } from "@/lib/scope";
import { deleteStoredFile, saveUpload } from "@/lib/storage";

export type DocumentState = { error?: string; notice?: string };

export async function uploadDocumentAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const actor = await requirePermission("DOCUMENTS", "ADD");

  const targetUserId = String(formData.get("userId") ?? "");
  const documentTypeId = String(formData.get("documentTypeId") ?? "");
  const documentNumber = String(formData.get("documentNumber") ?? "").trim();
  const file = formData.get("file");

  if (!(file instanceof File)) return { error: "errors.invalidInput" };
  if (!documentTypeId) return { error: "documents.pickType" };

  // Uploading for someone else needs both the permission and the data scope.
  if (targetUserId !== actor.id && !(await canSeeUser(actor, targetUserId))) {
    return { error: "errors.forbidden" };
  }

  const documentType = await prisma.documentType.findUnique({ where: { id: documentTypeId } });
  if (!documentType || !documentType.isActive) return { error: "documents.pickType" };
  if (documentType.requiresNumber && documentNumber.length === 0) {
    return { error: "errors.invalidInput" };
  }

  let saved;
  try {
    saved = await saveUpload(targetUserId, file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "errors.unexpected";
    return { error: message.includes(".") ? message : "errors.unexpected" };
  }

  const created = await prisma.document.create({
    data: {
      userId: targetUserId,
      documentTypeId,
      originalName: saved.originalName,
      storedPath: saved.storedPath,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      documentNumber: documentNumber || null,
      uploadedById: actor.id,
    },
  });

  await writeAudit({
    actorUserId: actor.id,
    action: "DOCUMENT_UPLOADED",
    entity: "Document",
    entityId: created.id,
    summary: `${documentType.name} for ${targetUserId}`,
  });

  revalidatePath(`/documents/${targetUserId}`);
  revalidatePath("/documents/me");
  return { notice: "documents.uploaded" };
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("DOCUMENTS", "DELETE");
  const documentId = String(formData.get("documentId") ?? "");

  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) return;
  if (document.userId !== actor.id && !(await canSeeUser(actor, document.userId))) return;

  await prisma.document.delete({ where: { id: documentId } });
  await deleteStoredFile(document.storedPath);

  await writeAudit({
    actorUserId: actor.id,
    action: "DOCUMENT_DELETED",
    entity: "Document",
    entityId: documentId,
    summary: document.originalName,
  });

  revalidatePath(`/documents/${document.userId}`);
  revalidatePath("/documents/me");
}
