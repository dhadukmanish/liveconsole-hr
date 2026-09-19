"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { UserFormState } from "@/app/(app)/users/actions";

export type RoleOption = { id: string; code: string; name: string };
export type ManagerOption = { id: string; name: string; roleCode: string };

export type UserFormDefaults = {
  id?: string;
  name?: string;
  mobile?: string;
  email?: string | null;
  roleId?: string;
  managerId?: string | null;
  loginMethod?: "OTP" | "PASSWORD";
  employeeCode?: string | null;
  designation?: string | null;
  department?: string | null;
  whatsappOptOut?: boolean;
};

export function UserForm({
  action,
  roles,
  managers,
  defaults = {},
  submitLabelKey,
}: {
  action: (state: UserFormState, formData: FormData) => Promise<UserFormState>;
  roles: RoleOption[];
  managers: ManagerOption[];
  defaults?: UserFormDefaults;
  submitLabelKey: string;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(action, {});
  const [loginMethod, setLoginMethod] = useState<"OTP" | "PASSWORD">(
    defaults.loginMethod ?? "OTP",
  );

  const message = (value?: string) =>
    value ? (value.includes(".") ? t(value) : value) : undefined;

  return (
    <form action={formAction}>
      {defaults.id ? <input type="hidden" name="userId" value={defaults.id} /> : null}

      {state.error ? (
        <Alert tone="danger" className="mb-4">
          {message(state.error)}
        </Alert>
      ) : null}

      {state.notice && !state.generatedPassword ? (
        <Alert tone="success" className="mb-4">
          {t(state.notice as "users.created")}
        </Alert>
      ) : null}

      {state.generatedPassword ? (
        <Alert tone="warning" className="mb-4">
          {t("users.passwordResetTo", { password: state.generatedPassword })}
        </Alert>
      ) : null}

      <Field label={t("users.name")} htmlFor="name" error={message(state.fieldErrors?.name)}>
        <Input id="name" name="name" required defaultValue={defaults.name ?? ""} autoComplete="off" />
      </Field>

      <Field label={t("users.mobile")} htmlFor="mobile" error={message(state.fieldErrors?.mobile)}>
        <Input
          id="mobile"
          name="mobile"
          type="tel"
          inputMode="numeric"
          required
          maxLength={13}
          defaultValue={defaults.mobile ?? ""}
          autoComplete="off"
        />
      </Field>

      <Field label={t("users.email")} htmlFor="email" error={message(state.fieldErrors?.email)}>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={defaults.email ?? ""}
          autoComplete="off"
        />
      </Field>

      <Field label={t("users.role")} htmlFor="roleId" error={message(state.fieldErrors?.roleId)}>
        <Select id="roleId" name="roleId" required defaultValue={defaults.roleId ?? ""}>
          <option value="" disabled>
            {t("users.role")}
          </option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {t(`roles.${role.code}` as "roles.ADMIN")}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={t("users.manager")}
        htmlFor="managerId"
        error={message(state.fieldErrors?.managerId)}
      >
        <Select id="managerId" name="managerId" defaultValue={defaults.managerId ?? ""}>
          <option value="">{t("users.noManager")}</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t("users.loginMethod")} htmlFor="loginMethod">
        <Select
          id="loginMethod"
          name="loginMethod"
          value={loginMethod}
          onChange={(event) => setLoginMethod(event.target.value as "OTP" | "PASSWORD")}
        >
          <option value="OTP">{t("users.loginOtp")}</option>
          <option value="PASSWORD">{t("users.loginPassword")}</option>
        </Select>
      </Field>

      {loginMethod === "PASSWORD" && !defaults.id ? (
        <Field
          label={t("users.initialPassword")}
          htmlFor="initialPassword"
          hint="Leave blank and one will be generated for you"
          error={message(state.fieldErrors?.initialPassword)}
        >
          <Input
            id="initialPassword"
            name="initialPassword"
            type="text"
            autoComplete="off"
            minLength={8}
          />
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("users.employeeCode")} htmlFor="employeeCode">
          <Input id="employeeCode" name="employeeCode" defaultValue={defaults.employeeCode ?? ""} />
        </Field>
        <Field label={t("users.designation")} htmlFor="designation">
          <Input id="designation" name="designation" defaultValue={defaults.designation ?? ""} />
        </Field>
        <Field label={t("users.department")} htmlFor="department">
          <Input id="department" name="department" defaultValue={defaults.department ?? ""} />
        </Field>
      </div>

      {/* A person can ask not to be pinged without losing access to anything:
          the app still shows them everything. */}
      <label className="mb-4 flex min-h-12 items-center gap-3 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          name="whatsappOptOut"
          defaultChecked={defaults.whatsappOptOut ?? false}
          className="h-6 w-6 shrink-0 rounded border-hairline accent-brand"
        />
        <span>
          {t("notify.optOut")}
          <span className="block text-sm font-normal text-muted">{t("notify.optOutHint")}</span>
        </span>
      </label>

      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending ? t("common.loading") : t(submitLabelKey as "common.save")}
      </Button>
    </form>
  );
}
