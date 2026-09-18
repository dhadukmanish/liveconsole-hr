import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BellRing, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardMuted } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { daysUntil, expiryTone } from "@/lib/expiry";
import { formatDate, workDateFor } from "@/lib/workday";

export default async function LicensesPage() {
  const user = await requirePermissionPage("LICENSES", "VIEW");
  const t = await getTranslations();
  const today = workDateFor();

  const licenses = await prisma.license.findMany({
    where: { isActive: true },
    include: { owner: { select: { name: true } } },
    // Soonest first: the list is a to-do list, not a catalogue.
    orderBy: [{ expiryDate: "asc" }],
    take: 300,
  });

  const rows = licenses.map((license) => {
    const days = daysUntil(license.expiryDate, today);
    return { ...license, days, tone: expiryTone(days, license.remindDaysBefore) };
  });
  const attention = rows.filter((row) => row.tone !== "success").length;

  const canEdit = can(user, "LICENSES", "EDIT");

  return (
    <>
      <PageHeader
        title={t("licenses.title")}
        subtitle={t("licenses.count", { count: rows.length })}
        action={
          can(user, "LICENSES", "ADD") ? (
            <Link href="/licenses/new" className={buttonVariants({ variant: "primary" })}>
              <Plus className="h-5 w-5" aria-hidden />
              {t("licenses.new")}
            </Link>
          ) : null
        }
      />

      {attention > 0 ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-pending/40 bg-pending/15 px-3 py-2.5 text-sm font-medium text-pending-ink">
          <BellRing className="h-5 w-5 shrink-0" aria-hidden />
          <span>{t("licenses.attention", { count: attention })}</span>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState>{t("licenses.none")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((license) => (
            <li key={license.id}>
              <Card className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{license.name}</p>
                  {license.vendor ? <CardMuted className="truncate">{license.vendor}</CardMuted> : null}
                  <CardMuted className="truncate">
                    {t("licenses.expiresOn", { date: formatDate(license.expiryDate) })}
                  </CardMuted>
                  {license.owner ? (
                    <CardMuted className="truncate">
                      {t("licenses.ownerIs", { name: license.owner.name })}
                    </CardMuted>
                  ) : null}
                  {canEdit ? (
                    <Link
                      href={`/licenses/${license.id}`}
                      className="mt-1.5 block text-sm font-semibold text-brand-ink underline underline-offset-4"
                    >
                      {t("common.edit")}
                    </Link>
                  ) : null}
                </div>

                <Badge tone={license.tone} className="shrink-0">
                  {license.days < 0
                    ? t("licenses.expiredAgo", { days: Math.abs(license.days) })
                    : license.days === 0
                      ? t("licenses.expiresToday")
                      : t("licenses.inDays", { days: license.days })}
                </Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
