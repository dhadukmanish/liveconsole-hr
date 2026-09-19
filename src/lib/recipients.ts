import { prisma } from "@/lib/prisma";
import { ROLE_ADMIN, ROLE_SUPERADMIN } from "@/lib/rbac";

export type Recipient = { id: string; name: string; mobile: string };

/** Who to tell when there is nobody more specific. */
export async function adminUsers(): Promise<Recipient[]> {
  return prisma.user.findMany({
    where: { status: "ACTIVE", role: { code: { in: [ROLE_SUPERADMIN, ROLE_ADMIN] } } },
    select: { id: true, name: true, mobile: true },
    orderBy: { name: "asc" },
  });
}

/**
 * The person's manager, or the admins if they have none or the manager has
 * left. Used for anything that needs a decision: a request sitting with
 * somebody who no longer works here is a request nobody is looking at.
 */
export async function managerOrAdmins(userId: string): Promise<Recipient[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { manager: { select: { id: true, name: true, mobile: true, status: true } } },
  });

  const manager = user?.manager;
  if (manager && manager.status === "ACTIVE") {
    return [{ id: manager.id, name: manager.name, mobile: manager.mobile }];
  }
  return adminUsers();
}
