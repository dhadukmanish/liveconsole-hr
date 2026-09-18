import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { requirePermissionPage } from "@/lib/auth/guard";

export default async function Page() {
  await requirePermissionPage("TASK", "VIEW");
  const t = await getTranslations();

  return (
    <>
      <PageHeader title={t("nav.task")} />
      <EmptyState>{t("home.tasksDisabled")}</EmptyState>
    </>
  );
}
