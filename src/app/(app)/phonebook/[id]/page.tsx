import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ContactForm } from "@/components/contact-form";
import { PageHeader } from "@/components/ui/page";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { deleteContactAction, saveContactAction } from "../actions";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermissionPage("PHONEBOOK", "EDIT");
  const t = await getTranslations();
  const { id } = await params;

  const [contact, categoryRows] = await Promise.all([
    prisma.contact.findUnique({ where: { id } }),
    prisma.contact.findMany({
      where: { isActive: true, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);
  if (!contact) notFound();

  return (
    <>
      <Link
        href="/phonebook"
        className="mb-3 inline-flex min-h-12 items-center gap-1 text-sm font-semibold text-brand-ink"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
        {t("common.back")}
      </Link>

      <PageHeader title={contact.name} subtitle={contact.company ?? undefined} />

      <Card className="mb-4">
        <ContactForm
          action={saveContactAction}
          defaults={contact}
          categories={categoryRows
            .map((row) => row.category)
            .filter((value): value is string => Boolean(value))}
          submitLabelKey="common.save"
        />
      </Card>

      {can(user, "PHONEBOOK", "DELETE") ? (
        <Card>
          <CardTitle className="mb-2">{t("phonebook.deleteTitle")}</CardTitle>
          <form action={deleteContactAction}>
            <input type="hidden" name="contactId" value={contact.id} />
            <Button type="submit" variant="danger">
              {t("common.delete")}
            </Button>
          </form>
        </Card>
      ) : null}
    </>
  );
}
