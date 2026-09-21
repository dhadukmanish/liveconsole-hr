import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardMuted } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { userScopeFilter, visibleUserIds } from "@/lib/scope";
import { initials } from "@/lib/utils";
import { redirect } from "next/navigation";

export default async function DocumentsIndexPage() {
  const actor = await requirePermissionPage("DOCUMENTS", "VIEW");
  const t = await getTranslations();

  const scope = await visibleUserIds(actor);
  // An employee only ever sees themselves, so skip the list entirely.
  if (scope !== "ALL" && scope.length <= 1) redirect(`/documents/${actor.id}`);

  const where = await userScopeFilter(actor);
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      mobile: true,
      _count: { select: { documents: true } },
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  return (
    <>
      <PageHeader title={t("documents.title")} />

      {users.length === 0 ? (
        <EmptyState>{t("common.noResults")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((row) => (
            <li key={row.id}>
              <Link href={`/documents/${row.id}`} prefetch={false} className="block">
                <Card className="flex items-center gap-3 transition-[border-color,transform] duration-150 hover:border-brand active:scale-[0.99]">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand-ink">
                    {initials(row.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{row.name}</p>
                    <CardMuted className="truncate">{row.mobile}</CardMuted>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-muted">
                    {row._count.documents}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
