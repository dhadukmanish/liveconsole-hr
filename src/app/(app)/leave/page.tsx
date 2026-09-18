import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { requirePermissionPage } from "@/lib/auth/guard";

export default async function Page() {
  await requirePermissionPage("LEAVE", "VIEW");
  const t = await getTranslations();

  return (
    <>
      <PageHeader title={t("nav.leave")} />
      <EmptyState>{t("common.comingSoon")}</EmptyState>
    </>
  );
}
