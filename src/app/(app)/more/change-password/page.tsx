import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/change-password-form";
import { PageHeader } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/guard";

export default async function ChangePasswordPage() {
  const user = await requireUser();
  const t = await getTranslations();

  return (
    <>
      <PageHeader title={t("auth.changePassword")} />
      <Card>
        {user.loginMethod === "OTP" ? (
          <Alert tone="info">{t("auth.notPasswordUser")}</Alert>
        ) : (
          <ChangePasswordForm />
        )}
      </Card>
    </>
  );
}
