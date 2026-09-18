import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { UserForm } from "@/components/user-form";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_SUPERADMIN } from "@/lib/rbac";
import { userScopeFilter } from "@/lib/scope";
import { createUserAction } from "../actions";

const RANK: Record<string, number> = {
  [ROLE_SUPERADMIN]: 3,
  [ROLE_ADMIN]: 2,
  [ROLE_EMPLOYEE]: 1,
};

export default async function NewUserPage() {
  const actor = await requirePermissionPage("USERS", "ADD");
  const t = await getTranslations();

  // Mirrors the server rule: only roles strictly below your own are offered.
  const roles = (await prisma.role.findMany({ orderBy: { sortOrder: "asc" } })).filter(
    (role) => (RANK[role.code] ?? 0) < (RANK[actor.roleCode] ?? 0),
  );

  const scope = await userScopeFilter(actor);
  const managers = await prisma.user.findMany({
    where: { ...scope, status: "ACTIVE" },
    select: { id: true, name: true, role: { select: { code: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader title={t("users.newUser")} />
      <Card>
        <UserForm
          action={createUserAction}
          roles={roles.map((role) => ({ id: role.id, code: role.code, name: role.name }))}
          managers={managers.map((manager) => ({
            id: manager.id,
            name: manager.name,
            roleCode: manager.role.code,
          }))}
          defaults={{ managerId: actor.id }}
          submitLabelKey="common.create"
        />
      </Card>
    </>
  );
}
