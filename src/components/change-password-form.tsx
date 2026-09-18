"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  changePasswordAction,
  type ChangePasswordState,
} from "@/app/(app)/more/change-password/actions";

/** Translates a key if it looks like one, otherwise shows the raw zod message. */
function useMessage() {
  const t = useTranslations();
  return (value?: string) => {
    if (!value) return undefined;
    return value.includes(".") ? t(value) : value;
  };
}

export function ChangePasswordForm() {
  const t = useTranslations();
  const message = useMessage();
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={formAction}>
      {state.error ? (
        <Alert tone="danger" className="mb-4">
          {message(state.error)}
        </Alert>
      ) : null}

      <Field
        label={t("auth.currentPassword")}
        htmlFor="currentPassword"
        error={message(state.fieldErrors?.currentPassword)}
      >
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Field
        label={t("auth.newPassword")}
        htmlFor="newPassword"
        hint="At least 8 characters"
        error={message(state.fieldErrors?.newPassword)}
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>

      <Field
        label={t("auth.confirmPassword")}
        htmlFor="confirmPassword"
        error={message(state.fieldErrors?.confirmPassword)}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("common.loading") : t("auth.changePassword")}
      </Button>
    </form>
  );
}
