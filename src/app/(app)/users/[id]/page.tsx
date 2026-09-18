import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { UserAdminActions } from "@/components/user-admin-actions";
import { UserForm } from "@/components/user-form";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_SUPERADMIN } from "@/lib/rbac";
import { canSeeUser, userScopeFilter } from "@/lib/scope";
import { updateUserAction } from "../actions";

const RANK: Record<string, number> = {
  [ROLE_SUPERADMIN]: 3,
  [ROLE_ADMIN]: 2,
  [ROLE_EMPLOYEE]: 1,
};

const STATUS_TONE = {
  ACTIVE: "success",
  BLOCKED: "danger",
  INACTIVE: "neutral",
} as const;

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePermissionPage("USERS", "VIEW");
  const { id } = await params;
  const t = await getTranslations();

  if (!(await canSeeUser(actor, id))) notFound();

  const target = await prisma.user.findUnique({
    where: { id },
    include: { role: true, profile: true },
  });
  if (!target) notFound();

  const outranksActor =
    target.id !== actor.id && (RANK[target.role.code] ?? 0) >= (RANK[actor.roleCode] ?? 0);
  const editable = can(actor, "USERS", "EDIT") && !outranksActor;

  const roles = (await prisma.role.findMany({ orderBy: { sortOrder: "asc" } })).filter(
    (role) =>
      (RANK[role.code] ?? 0) < (RANK[actor.roleCode] ?? 0) || role.id === target.roleId,
  );

  const scope = await userScopeFilter(actor);
  const managers = (
    await prisma.user.findMany({
      where: { ...scope, status: "ACTIVE" },
      select: { id: true, name: true, role: { select: { code: true } } },
      orderBy: { name: "asc" },
    })
  ).filter((manager) => manager.id !== target.id);

  return (
    <>
      <PageHeader
        title={target.name}
        subtitle={target.mobile}
        action={
          <div className="flex flex-col items-end gap-1">
            <Badge tone="brand">{t(`roles.${target.role.code}` as "roles.ADMIN")}</Badge>
            <Badge tone={STATUS_TONE[target.status]}>
              {t(`common.${target.status.toLowerCase()}` as "common.active")}
            </Badge>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 text-sm font-semibold">
        {can(actor, "DOCUMENTS", "VIEW") ? (
          <Link href={`/documents/${target.id}`} className="text-brand underline underline-offset-4">
            {t("documents.title")}
          </Link>
        ) : null}
        {actor.isSuperAdmin ? (
          <Link
            href={`/permissions/user/${target.id}`}
            className="text-brand underline underline-offset-4"
          >
            {t("permissions.userOverrides")}
          </Link>
        ) : null}
      </div>

      {editable ? (
        <Card className="mb-4">
          <CardTitle className="mb-3">{t("users.editUser")}</CardTitle>
          <UserForm
            action={updateUserAction}
            roles={roles.map((role) => ({ id: role.id, code: role.code, name: role.name }))}
            managers={managers.map((manager) => ({
              id: manager.id,
              name: manager.name,
              roleCode: manager.role.code,
            }))}
            defaults={{
              id: target.id,
              name: target.name,
              mobile: target.mobile,
              email: target.email,
              roleId: target.roleId,
              managerId: target.managerId,
              loginMethod: target.loginMethod,
              employeeCode: target.profile?.employeeCode ?? "",
              designation: target.profile?.designation ?? "",
              department: target.profile?.department ?? "",
            }}
            submitLabelKey="common.save"
          />
        </Card>
      ) : (
        <Card className="mb-4">
          <CardTitle>{t("errors.forbidden")}</CardTitle>
        </Card>
      )}

      {target.id !== actor.id ? (
        <Card>
          <CardTitle className="mb-3">{t("users.status")}</CardTitle>
          <UserAdminActions userId={target.id} status={target.status} canEdit={editable} />
        </Card>
      ) : null}
    </>
  );
}
