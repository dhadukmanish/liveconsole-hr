"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { step: "mobile" };

export function LoginForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  const step = state.step;

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="intent" value={step === "mobile" ? "start" : step} />

      {state.error ? (
        <Alert tone="danger" className="mb-4">
          {t(state.error)}
        </Alert>
      ) : null}

      {state.notice && !state.error ? (
        <Alert tone="success" className="mb-4">
          {t(state.notice)}
        </Alert>
      ) : null}

      {state.devOtp ? (
        <Alert tone="warning" className="mb-4 font-mono tracking-wider">
          {t("auth.devOtpBanner", { code: state.devOtp })}
        </Alert>
      ) : null}

      <Field label={t("auth.mobile")} htmlFor="mobile">
        <Input
          id="mobile"
          name="mobile"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={13}
          required
          readOnly={step !== "mobile"}
          defaultValue={state.mobile ?? ""}
          placeholder={t("auth.mobilePlaceholder")}
          aria-describedby="mobile-hint"
        />
      </Field>

      {step === "password" ? (
        <Field label={t("auth.password")} htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
        </Field>
      ) : null}

      {step === "otp" ? (
        <Field label={t("auth.otp")} htmlFor="code" hint={t("auth.otpHint")}>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            className="text-center text-2xl tracking-[0.5em]"
          />
        </Field>
      ) : null}

      {/* One big primary button per screen, as the brief asks. */}
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending
          ? t("common.loading")
          : step === "mobile"
            ? t("auth.signIn")
            : step === "otp"
              ? t("auth.verifyOtp")
              : t("auth.signIn")}
      </Button>

      {step === "otp" ? (
        <Button
          type="submit"
          name="intent"
          value="start"
          variant="link"
          className="mx-auto mt-3 block"
          disabled={pending}
        >
          {t("auth.resendOtp")}
        </Button>
      ) : null}
    </form>
  );
}
