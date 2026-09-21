import { redirect } from "next/navigation";
import type { PermissionAction, PermissionModule } from "@prisma/client";
import { can, getCurrentUser, readCurrentUser, type CurrentUser } from "./session";

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
  // Uncached on purpose: see the note on getCurrentUser. An action and the
  // render that follows it share a request, so an action reading through the
  // memo can leave the render looking at the row it just changed, unchanged.
  const user = await readCurrentUser();
  if (!user) throw new ForbiddenError("not signed in");
  if (!can(user, module, action)) throw new ForbiddenError(`${module}:${action} denied`);
  return user;
}

/** requireUser's counterpart for actions: uncached, and it throws rather than
    redirecting. */
export async function requireUserAction(): Promise<CurrentUser> {
  const user = await readCurrentUser();
  if (!user) throw new ForbiddenError("not signed in");
  return user;
}

/** Permissions administration is SUPERADMIN-only per the brief. */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/home");
  return user;
}

export async function requireSuperAdminAction(): Promise<CurrentUser> {
  const user = await readCurrentUser();
  if (!user?.isSuperAdmin) throw new ForbiddenError("superadmin only");
  return user;
}
