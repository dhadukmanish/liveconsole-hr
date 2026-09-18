import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { UserPermissionGrid } from "@/components/permission-grid";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { ACTIONS, MODULES, ROLE_SUPERADMIN } from "@/lib/rbac";
import { saveUserPermissionsAction } from "../../actions";

export default async function UserPermissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const t = await getTranslations();

  const target = await prisma.user.findUnique({
    where: { id },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      permissions: { include: { permission: true } },
    },
  });
  if (!target) notFound();

  const roleAllowed = new Set(
    target.role.permissions
      .filter((row) => row.allowed)
      .map((row) => `${row.permission.module}:${row.permission.action}`),
  );

  const overrides = new Map(
    target.permissions.map((row) => [
      `${row.permission.module}:${row.permission.action}`,
      row.allowed,
    ]),
  );

  return (
    <>
      <PageHeader title={t("permissions.userOverrides")} subtitle={target.name} />

      {target.role.code === ROLE_SUPERADMIN ? (
        <Alert tone="info">{t("permissions.superadminNote")}</Alert>
      ) : (
        <Card>
          <UserPermissionGrid
            action={saveUserPermissionsAction}
            userId={target.id}
            modules={MODULES}
            actions={ACTIONS}
            roleAllowed={roleAllowed}
            overrides={overrides}
          />
        </Card>
      )}
    </>
  );
}
