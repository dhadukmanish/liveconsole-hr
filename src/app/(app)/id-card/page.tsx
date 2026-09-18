import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card, CardMuted, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { initials } from "@/lib/utils";
import { requireUser } from "@/lib/auth/guard";

export default async function IdCardPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const ready = Boolean(user.profile?.employeeCode);

  return (
    <>
      <PageHeader title={t("idCard.title")} />

      {/* On-screen preview of what the PDF contains. */}
      <Card className="mb-4">
        <div className="flex gap-4">
          <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded-xl bg-hairline text-xl font-bold text-muted">
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate">{user.name}</CardTitle>
            <CardMuted className="truncate">{user.profile?.designation ?? "—"}</CardMuted>
            <CardMuted className="truncate">{user.profile?.department ?? "—"}</CardMuted>
            <p className="mt-1 text-sm font-bold text-ink">
              {user.profile?.employeeCode ?? "—"}
            </p>
            <CardMuted>{user.mobile}</CardMuted>
          </div>
        </div>
      </Card>

      {ready ? (
        <a
          href="/api/id-card"
          className="flex min-h-14 w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-on-brand hover:bg-brand-hover"
        >
          {t("idCard.download")}
        </a>
      ) : (
        <Alert tone="warning">{t("idCard.needsProfile")}</Alert>
      )}
    </>
  );
}
