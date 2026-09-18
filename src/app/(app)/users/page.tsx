import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardMuted } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { userScopeFilter } from "@/lib/scope";
import { initials } from "@/lib/utils";

const STATUS_TONE = {
  ACTIVE: "success",
  BLOCKED: "danger",
  INACTIVE: "neutral",
} as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermissionPage("USERS", "VIEW");
  const t = await getTranslations();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const scope = await userScopeFilter(user);
  const users = await prisma.user.findMany({
    where: {
      ...scope,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { mobile: { contains: query } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { role: true, profile: { select: { designation: true, employeeCode: true } } },
    orderBy: [{ name: "asc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader
        title={t("users.title")}
        subtitle={`${users.length}`}
        action={
          can(user, "USERS", "ADD") ? (
            <Link href="/users/new" className={buttonVariants({ variant: "primary" })}>
              <Plus className="h-5 w-5" aria-hidden />
              {t("users.newUser")}
            </Link>
          ) : null
        }
      />

      {/* GET form: the search term stays in the URL and survives a refresh. */}
      <form className="mb-4">
        <Input
          name="q"
          type="search"
          defaultValue={query}
          placeholder={t("common.search")}
          aria-label={t("common.search")}
        />
      </form>

      {users.length === 0 ? (
        <EmptyState>{t("common.noResults")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((row) => (
            <li key={row.id}>
              <Link href={`/users/${row.id}`} className="block">
                <Card className="flex items-center gap-3 transition-colors hover:border-brand">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand-hover dark:text-brand">
                    {initials(row.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{row.name}</p>
                    <CardMuted className="truncate">
                      {row.mobile}
                      {row.profile?.designation ? ` · ${row.profile.designation}` : ""}
                    </CardMuted>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone="brand">{t(`roles.${row.role.code}` as "roles.ADMIN")}</Badge>
                    <Badge tone={STATUS_TONE[row.status]}>
                      {t(`common.${row.status.toLowerCase()}` as "common.active")}
                    </Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
