import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { requirePermissionPage } from "@/lib/auth/guard";

export default async function Page() {
  await requirePermissionPage("ATTENDANCE", "VIEW");
  const t = await getTranslations();

  return (
    <>
      <PageHeader title={t("nav.attendance")} />
      <EmptyState>{t("home.checkInDisabled")}</EmptyState>
    </>
  );
}
