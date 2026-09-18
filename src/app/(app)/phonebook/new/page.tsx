import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ContactForm } from "@/components/contact-form";
import { PageHeader } from "@/components/ui/page";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { saveContactAction } from "../actions";

export default async function NewContactPage() {
  await requirePermissionPage("PHONEBOOK", "ADD");
  const t = await getTranslations();

  const categoryRows = await prisma.contact.findMany({
    where: { isActive: true, category: { not: null } },
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });

  return (
    <>
      <Link
        href="/phonebook"
        className="mb-3 inline-flex min-h-12 items-center gap-1 text-sm font-semibold text-brand-ink"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
        {t("common.back")}
      </Link>

      <PageHeader title={t("phonebook.new")} />

      <Card>
        <ContactForm
          action={saveContactAction}
          categories={categoryRows
            .map((row) => row.category)
            .filter((value): value is string => Boolean(value))}
          submitLabelKey="common.create"
        />
      </Card>
    </>
  );
}
