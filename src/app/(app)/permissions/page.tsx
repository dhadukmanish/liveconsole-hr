import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card, CardMuted, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { RolePermissionGrid } from "@/components/permission-grid";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { ACTIONS, MODULES, ROLE_SUPERADMIN } from "@/lib/rbac";
import { saveRolePermissionsAction } from "./actions";

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  await requireSuperAdmin();
  const t = await getTranslations();
  const { role: roleCodeParam } = await searchParams;

  const roles = await prisma.role.findMany({ orderBy: { sortOrder: "asc" } });
  const editable = roles.filter((role) => role.code !== ROLE_SUPERADMIN);
  const selected =
    editable.find((role) => role.code === roleCodeParam) ?? editable[0] ?? null;

  const allowed = new Set<string>();
  if (selected) {
    const rows = await prisma.rolePermission.findMany({
      where: { roleId: selected.id, allowed: true },
      include: { permission: true },
    });
    for (const row of rows) allowed.add(`${row.permission.module}:${row.permission.action}`);
  }

  return (
    <>
      <PageHeader title={t("permissions.title")} subtitle={t("permissions.roleDefaults")} />

      <Alert tone="info" className="mb-4">
        {t("permissions.superadminNote")}
      </Alert>

      <div className="mb-4 flex flex-wrap gap-2">
        {editable.map((role) => (
          <Link
            key={role.id}
            href={`/permissions?role=${role.code}`}
            className={`flex min-h-12 items-center rounded-xl border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
              selected?.id === role.id
                ? "border-brand bg-brand text-on-brand"
                : "border-hairline bg-card text-ink"
            }`}
          >
            {t(`roles.${role.code}` as "roles.ADMIN")}
          </Link>
        ))}
      </div>

      {selected ? (
        <Card>
          <CardTitle className="mb-1">{t(`roles.${selected.code}` as "roles.ADMIN")}</CardTitle>
          <CardMuted className="mb-3">{selected.description}</CardMuted>
          <RolePermissionGrid
            action={saveRolePermissionsAction}
            roleId={selected.id}
            modules={MODULES}
            actions={ACTIONS}
            allowed={allowed}
          />
        </Card>
      ) : null}
    </>
  );
}
