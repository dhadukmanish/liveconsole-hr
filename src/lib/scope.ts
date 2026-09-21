import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { ROLE_ADMIN, ROLE_SUPERADMIN } from "@/lib/rbac";
import type { CurrentUser } from "@/lib/auth/session";

/**
 * Data scope is deliberately separate from permission. Having USERS:VIEW says
 * *whether* you can open the Users screen; scope says *whose* rows you get.
 *
 *   EMPLOYEE   -> themselves only
 *   ADMIN      -> themselves plus everyone under them, recursively by manager_id
 *   SUPERADMIN -> everyone
 *
 * Memoised per request, keyed on the two things it actually depends on. One
 * screen can ask three times — the page for its own list, and two dashboard
 * queries for theirs — and for an admin each ask was another recursive walk of
 * the org chart over the wire.
 */
export function visibleUserIds(actor: CurrentUser): Promise<string[] | "ALL"> {
  return resolveScope(actor.roleCode, actor.id);
}

const resolveScope = cache(async function resolveScope(
  roleCode: string,
  actorId: string,
): Promise<string[] | "ALL"> {
  if (roleCode === ROLE_SUPERADMIN) return "ALL";

  if (roleCode === ROLE_ADMIN) {
    // Recursive CTE rather than a loop of queries: an org chart can be deep and
    // this stays one round trip. The UNION also makes a cyclic manager_id safe.
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE team AS (
        SELECT id FROM users WHERE id = ${actorId}
        UNION
        SELECT u.id FROM users u INNER JOIN team t ON u."managerId" = t.id
      )
      SELECT id FROM team
    `;
    return rows.map((row) => row.id);
  }

  return [actorId];
});

/** Ready-made Prisma filter for a `users` query. */
export async function userScopeFilter(actor: CurrentUser) {
  const ids = await visibleUserIds(actor);
  return ids === "ALL" ? {} : { id: { in: ids } };
}

export async function canSeeUser(actor: CurrentUser, userId: string): Promise<boolean> {
  if (actor.id === userId) return true;
  const ids = await visibleUserIds(actor);
  return ids === "ALL" || ids.includes(userId);
}
