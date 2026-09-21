import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessageCircle, Phone, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardMuted } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { telHref, whatsappHref } from "@/lib/phone";

export default async function PhonebookPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>;
}) {
  const user = await requirePermissionPage("PHONEBOOK", "VIEW");
  const t = await getTranslations();
  const { q, cat } = await searchParams;
  const query = q?.trim() ?? "";
  const category = cat?.trim() ?? "";

  // The phone book is company-wide by design: it holds vendors and clients,
  // not employees, so there is nothing to scope by manager.
  const [contacts, categoryRows] = await Promise.all([
    prisma.contact.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { company: { contains: query, mode: "insensitive" } },
                { designation: { contains: query, mode: "insensitive" } },
                { phone: { contains: query } },
                { altPhone: { contains: query } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: "asc" }],
      take: 300,
    }),
    prisma.contact.findMany({
      where: { isActive: true, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);

  const categories = categoryRows
    .map((row) => row.category)
    .filter((value): value is string => Boolean(value));

  const canEdit = can(user, "PHONEBOOK", "EDIT");

  const chip = (active: boolean) =>
    `flex min-h-12 shrink-0 items-center rounded-xl border px-4 text-sm font-semibold ${
      active ? "border-brand bg-brand text-on-brand" : "border-hairline bg-card text-ink"
    }`;

  return (
    <>
      <PageHeader
        title={t("phonebook.title")}
        subtitle={t("phonebook.count", { count: contacts.length })}
        action={
          can(user, "PHONEBOOK", "ADD") ? (
            <Link href="/phonebook/new" className={buttonVariants({ variant: "primary" })}>
              <Plus className="h-5 w-5" aria-hidden />
              {t("phonebook.new")}
            </Link>
          ) : null
        }
      />

      {/* GET form: the search term stays in the URL and survives a refresh. */}
      <form className="mb-3">
        {category ? <input type="hidden" name="cat" value={category} /> : null}
        <Input
          name="q"
          type="search"
          defaultValue={query}
          placeholder={t("phonebook.searchPlaceholder")}
          aria-label={t("common.search")}
        />
      </form>

      {/* Pinned: these lists run for screens, and the control that changes
          which list you are looking at should not be one of the things you
          have to scroll back to find. Two elements rather than one — the outer
          carries the solid page colour, because the scroller paints only its
          edge shadows and is transparent in between. */}
      {categories.length > 0 ? (
        <div className="sticky top-0 z-10 -mx-4 mb-4 bg-page px-4 pt-2">
          <div className="lc-scroll-hint -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
          <Link href={query ? `/phonebook?q=${encodeURIComponent(query)}` : "/phonebook"} className={chip(!category)}>
            {t("phonebook.allCategories")}
          </Link>
          {categories.map((value) => {
            const params = new URLSearchParams({ cat: value });
            if (query) params.set("q", query);
            return (
              <Link key={value} href={`/phonebook?${params}`} className={chip(category === value)}>
                {value}
              </Link>
            );
          })}
          </div>
        </div>
      ) : null}

      {contacts.length === 0 ? (
        <EmptyState>{t("common.noResults")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {contacts.map((contact) => {
            const whatsapp = whatsappHref(contact.phone);
            return (
              <li key={contact.id}>
                <Card className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{contact.name}</p>
                    {contact.company || contact.designation ? (
                      <CardMuted className="truncate">
                        {[contact.designation, contact.company].filter(Boolean).join(" · ")}
                      </CardMuted>
                    ) : null}
                    <a
                      href={telHref(contact.phone)}
                      className="mt-0.5 inline-block text-sm font-semibold text-brand-ink underline underline-offset-4"
                    >
                      {contact.phone}
                    </a>
                    {contact.altPhone ? (
                      <CardMuted className="truncate">{contact.altPhone}</CardMuted>
                    ) : null}
                    {contact.category ? (
                      <Badge tone="neutral" className="mt-1.5">
                        {contact.category}
                      </Badge>
                    ) : null}
                    {canEdit ? (
                      <Link
                        href={`/phonebook/${contact.id}`}
                        className="mt-1.5 block text-sm font-semibold text-brand-ink underline underline-offset-4"
                      >
                        {t("common.edit")}
                      </Link>
                    ) : null}
                  </div>

                  {/* One tap to call is the whole point of a phone book on a phone. */}
                  <div className="flex shrink-0 gap-2">
                    <a
                      href={telHref(contact.phone)}
                      aria-label={`${t("phonebook.call")} ${contact.name}`}
                      className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-on-brand"
                    >
                      <Phone className="h-5 w-5" aria-hidden />
                    </a>
                    {whatsapp ? (
                      <a
                        href={whatsapp}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${t("phonebook.whatsapp")} ${contact.name}`}
                        className="flex h-12 w-12 items-center justify-center rounded-xl border border-hairline text-success-ink"
                      >
                        <MessageCircle className="h-5 w-5" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
