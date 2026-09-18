import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { LicenseForm } from "@/components/license-form";
import { PageHeader } from "@/components/ui/page";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { userScopeFilter } from "@/lib/scope";
import { toDateInput } from "@/lib/workday";
import { deleteLicenseAction, saveLicenseAction } from "../actions";

export default async function EditLicensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermissionPage("LICENSES", "EDIT");
  const t = await getTranslations();
  const { id } = await params;

  const [license, people] = await Promise.all([
    prisma.license.findUnique({ where: { id } }),
    prisma.user.findMany({
      where: { ...(await userScopeFilter(user)), status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);
  if (!license) notFound();

  return (
    <>
      <Link
        href="/licenses"
        className="mb-3 inline-flex min-h-12 items-center gap-1 text-sm font-semibold text-brand-ink"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
        {t("common.back")}
      </Link>

      <PageHeader title={license.name} subtitle={license.vendor ?? undefined} />

      <Card className="mb-4">
        <LicenseForm
          action={saveLicenseAction}
          people={people}
          defaults={{
            ...license,
            startDate: license.startDate ? toDateInput(license.startDate) : "",
            expiryDate: toDateInput(license.expiryDate),
          }}
          submitLabelKey="common.save"
        />
      </Card>

      {can(user, "LICENSES", "DELETE") ? (
        <Card>
          <CardTitle className="mb-2">{t("licenses.deleteTitle")}</CardTitle>
          <form action={deleteLicenseAction}>
            <input type="hidden" name="licenseId" value={license.id} />
            <Button type="submit" variant="danger">
              {t("common.delete")}
            </Button>
          </form>
        </Card>
      ) : null}
    </>
  );
}
