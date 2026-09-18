"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  resetPasswordAction,
  setUserStatusAction,
  type UserFormState,
} from "@/app/(app)/users/actions";

export function UserAdminActions({
  userId,
  status,
  canEdit,
}: {
  userId: string;
  status: "ACTIVE" | "BLOCKED" | "INACTIVE";
  canEdit: boolean;
}) {
  const t = useTranslations();
  const [resetState, resetAction, resetting] = useActionState<UserFormState, FormData>(
    resetPasswordAction,
    {},
  );

  if (!canEdit) return null;

  return (
    <div className="flex flex-col gap-3">
      {resetState.generatedPassword ? (
        <Alert tone="warning">
          {t("users.passwordResetTo", { password: resetState.generatedPassword })}
        </Alert>
      ) : null}
      {resetState.error ? <Alert tone="danger">{t(resetState.error)}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <form action={setUserStatusAction}>
          <input type="hidden" name="userId" value={userId} />
          <input
            type="hidden"
            name="status"
            value={status === "BLOCKED" ? "ACTIVE" : "BLOCKED"}
          />
          <Button type="submit" variant={status === "BLOCKED" ? "secondary" : "danger"}>
            {status === "BLOCKED" ? t("users.unblock") : t("users.block")}
          </Button>
        </form>

        <form action={setUserStatusAction}>
          <input type="hidden" name="userId" value={userId} />
          <input
            type="hidden"
            name="status"
            value={status === "INACTIVE" ? "ACTIVE" : "INACTIVE"}
          />
          <Button type="submit" variant="secondary">
            {status === "INACTIVE" ? t("users.activate") : t("users.deactivate")}
          </Button>
        </form>

        <form action={resetAction}>
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" variant="secondary" disabled={resetting}>
            {resetting ? t("common.loading") : t("users.resetPassword")}
          </Button>
        </form>
      </div>
    </div>
  );
}
