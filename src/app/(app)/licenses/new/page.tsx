import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LicenseForm } from "@/components/license-form";
import { PageHeader } from "@/components/ui/page";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { userScopeFilter } from "@/lib/scope";
import { saveLicenseAction } from "../actions";

export default async function NewLicensePage() {
  const user = await requirePermissionPage("LICENSES", "ADD");
  const t = await getTranslations();

  // Owner choices follow the actor's people scope: you cannot hand a renewal
  // to somebody you are not allowed to see.
  const people = await prisma.user.findMany({
    where: { ...(await userScopeFilter(user)), status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 300,
  });

  return (
    <>
      <Link
        href="/licenses"
        className="mb-3 inline-flex min-h-12 items-center gap-1 text-sm font-semibold text-brand-ink"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
        {t("common.back")}
      </Link>

      <PageHeader title={t("licenses.new")} />

      <Card>
        <LicenseForm action={saveLicenseAction} people={people} submitLabelKey="common.create" />
      </Card>
    </>
  );
}
