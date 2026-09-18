import { redirect } from "next/navigation";
import type { PermissionAction, PermissionModule } from "@prisma/client";
import { can, getCurrentUser, type CurrentUser } from "./session";

/** Thrown by action/route guards; surfaced to the client as a generic message. */
export class ForbiddenError extends Error {
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: sends the user somewhere they are allowed to be. */
export async function requirePermissionPage(
  module: PermissionModule,
  action: PermissionAction = "VIEW",
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, module, action)) redirect("/home");
  return user;
}

/**
 * For server actions and route handlers. Never redirect here — a redirect in a
 * mutation path reads as success to the caller.
 */
export async function requirePermission(
  module: PermissionModule,
  action: PermissionAction,
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("not signed in");
  if (!can(user, module, action)) throw new ForbiddenError(`${module}:${action} denied`);
  return user;
}

/** Permissions administration is SUPERADMIN-only per the brief. */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/home");
  return user;
}

export async function requireSuperAdminAction(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) throw new ForbiddenError("superadmin only");
  return user;
}
