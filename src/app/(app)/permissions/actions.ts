"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdminAction } from "@/lib/auth/guard";
import { writeAudit } from "@/lib/audit";
import { revokeAllSessions } from "@/lib/auth/session";
import { ACTIONS, MODULES, ROLE_SUPERADMIN } from "@/lib/rbac";
import type { PermissionAction, PermissionModule } from "@prisma/client";

export type PermissionsState = { error?: string; notice?: string; noticeName?: string };

function isModule(value: string): value is PermissionModule {
  return (MODULES as string[]).includes(value);
}

function isAction(value: string): value is PermissionAction {
  return (ACTIONS as string[]).includes(value);
}

/**
 * Checkbox forms only post the boxes that are ticked, so the grid also posts a
 * `known` field listing every cell it rendered. Without it an unticked box and
 * a cell that was never on screen look identical.
 */
function readGrid(formData: FormData) {
  const checked = new Set(formData.getAll("cell").map(String));
  const known = formData.getAll("known").map(String);

  return known.flatMap((key) => {
    const [module, action] = key.split(":");
    if (!module || !action || !isModule(module) || !isAction(action)) return [];
    return [{ module, action, allowed: checked.has(key) }];
  });
}

export async function saveRolePermissionsAction(
  _prev: PermissionsState,
  formData: FormData,
): Promise<PermissionsState> {
  const actor = await requireSuperAdminAction();
  const roleId = String(formData.get("roleId") ?? "");

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return { error: "errors.notFound" };

  // SUPERADMIN is unconditional; letting it be edited invites a lockout.
  if (role.code === ROLE_SUPERADMIN) return { error: "errors.forbidden" };

  const cells = readGrid(formData);
  if (cells.length === 0) return { error: "errors.invalidInput" };

  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((p) => [`${p.module}:${p.action}`, p.id]));

  await prisma.$transaction(
    cells.flatMap((cell) => {
      const permissionId = byKey.get(`${cell.module}:${cell.action}`);
      if (!permissionId) return [];
      return [
        prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId } },
          update: { allowed: cell.allowed },
          create: { roleId, permissionId, allowed: cell.allowed },
        }),
      ];
    }),
  );

  await writeAudit({
    actorUserId: actor.id,
    action: "ROLE_PERMISSIONS_SAVED",
    entity: "Role",
    entityId: roleId,
    summary: role.name,
  });

  revalidatePath("/permissions");
  revalidatePath("/", "layout");
  return { notice: "permissions.savedRole" };
}

/**
 * Per-user overrides are tri-state: inherit (no row), grant, or revoke.
 */
export async function saveUserPermissionsAction(
  _prev: PermissionsState,
  formData: FormData,
): Promise<PermissionsState> {
  const actor = await requireSuperAdminAction();
  const userId = String(formData.get("userId") ?? "");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!target) return { error: "errors.notFound" };
  if (target.role.code === ROLE_SUPERADMIN) return { error: "errors.forbidden" };

  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((p) => [`${p.module}:${p.action}`, p.id]));

  const operations = [];
  for (const [key, permissionId] of byKey) {
    const raw = formData.get(`cell:${key}`);
    if (raw === null) continue; // cell was not rendered
    const value = String(raw);

    if (value === "inherit") {
      operations.push(
        prisma.userPermission.deleteMany({ where: { userId, permissionId } }),
      );
    } else if (value === "grant" || value === "revoke") {
      const allowed = value === "grant";
      operations.push(
        prisma.userPermission.upsert({
          where: { userId_permissionId: { userId, permissionId } },
          update: { allowed },
          create: { userId, permissionId, allowed },
        }),
      );
    }
  }

  if (operations.length === 0) return { error: "errors.invalidInput" };
  await prisma.$transaction(operations);

  // The next request re-reads permissions from the database, so nothing needs
  // to be signed out — but an open page would still show stale navigation.
  revalidatePath(`/permissions/user/${userId}`);
  revalidatePath("/", "layout");

  await writeAudit({
    actorUserId: actor.id,
    action: "USER_PERMISSIONS_SAVED",
    entity: "User",
    entityId: userId,
    summary: target.name,
  });

  return { notice: "permissions.savedUser", noticeName: target.name };
}

/** Used when an override should stop applying everywhere at once. */
export async function clearUserOverridesAction(formData: FormData): Promise<void> {
  const actor = await requireSuperAdminAction();
  const userId = String(formData.get("userId") ?? "");
  await prisma.userPermission.deleteMany({ where: { userId } });
  await revokeAllSessions(userId);
  await writeAudit({
    actorUserId: actor.id,
    action: "USER_PERMISSIONS_CLEARED",
    entity: "User",
    entityId: userId,
  });
  revalidatePath(`/permissions/user/${userId}`);
}
