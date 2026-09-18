import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Audit writes must never break the action they describe, so failures are
 * logged and swallowed.
 */
export async function writeAudit(entry: {
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary ?? null,
        meta: entry.meta,
        ip: entry.ip ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record", entry.action, error);
  }
}
