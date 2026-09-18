import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/change-password-form";

/** Rendered in place of the whole app until the issued password is replaced. */
export async function ForcedPasswordChange({ name }: { name: string }) {
  const t = await getTranslations();
  return (
    <Card>
      <CardTitle>{t("auth.changePassword")}</CardTitle>
      <Alert tone="warning" className="my-3">
        {name} — set your own password before you continue.
      </Alert>
      <ChangePasswordForm />
    </Card>
  );
}
