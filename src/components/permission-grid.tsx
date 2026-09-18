"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { PermissionsState } from "@/app/(app)/permissions/actions";

export type GridCell = { module: string; action: string; allowed: boolean };

const ACTION_KEYS: Record<string, string> = {
  VIEW: "permissions.view",
  ADD: "permissions.add",
  EDIT: "permissions.edit",
  DELETE: "permissions.delete",
  APPROVE: "permissions.approve",
};

/** Role grid: a plain checkbox per module x action. */
export function RolePermissionGrid({
  action,
  roleId,
  modules,
  actions,
  allowed,
}: {
  action: (state: PermissionsState, formData: FormData) => Promise<PermissionsState>;
  roleId: string;
  modules: string[];
  actions: string[];
  allowed: Set<string>;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<PermissionsState, FormData>(action, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="roleId" value={roleId} />

      {state.error ? (
        <Alert tone="danger" className="mb-3">
          {t(state.error)}
        </Alert>
      ) : null}
      {state.notice ? (
        <Alert tone="success" className="mb-3">
          {t(state.notice as "permissions.savedRole")}
        </Alert>
      ) : null}

      {/* Sticky first column so the module name stays visible while scrolling. */}
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-page py-2 pr-2 text-left font-bold text-muted">
                {t("permissions.module")}
              </th>
              {actions.map((actionName) => (
                <th key={actionName} className="px-1 py-2 text-center font-bold text-muted">
                  {t(ACTION_KEYS[actionName] as "permissions.view")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((moduleName) => (
              <tr key={moduleName} className="border-t border-hairline">
                <th
                  scope="row"
                  className="sticky left-0 bg-page py-1 pr-2 text-left font-semibold text-ink"
                >
                  {t(`modules.${moduleName}` as "modules.TASK")}
                </th>
                {actions.map((actionName) => {
                  const key = `${moduleName}:${actionName}`;
                  return (
                    <td key={key} className="px-1 py-1 text-center">
                      <input type="hidden" name="known" value={key} />
                      <input
                        type="checkbox"
                        name="cell"
                        value={key}
                        defaultChecked={allowed.has(key)}
                        aria-label={`${moduleName} ${actionName}`}
                        className="h-6 w-6 accent-[var(--brand)]"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button type="submit" size="lg" disabled={pending} className="mt-4">
        {pending ? t("common.loading") : t("common.save")}
      </Button>
    </form>
  );
}

/** Per-user grid: tri-state select per cell (inherit / grant / revoke). */
export function UserPermissionGrid({
  action,
  userId,
  modules,
  actions,
  roleAllowed,
  overrides,
}: {
  action: (state: PermissionsState, formData: FormData) => Promise<PermissionsState>;
  userId: string;
  modules: string[];
  actions: string[];
  roleAllowed: Set<string>;
  overrides: Map<string, boolean>;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<PermissionsState, FormData>(action, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />

      {state.error ? (
        <Alert tone="danger" className="mb-3">
          {t(state.error)}
        </Alert>
      ) : null}
      {state.notice ? (
        <Alert tone="success" className="mb-3">
          {t("permissions.savedUser", { name: state.noticeName ?? "" })}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        {modules.map((moduleName) => (
          <fieldset key={moduleName} className="rounded-xl border border-hairline p-3">
            <legend className="px-1 text-sm font-bold text-ink">
              {t(`modules.${moduleName}` as "modules.TASK")}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {actions.map((actionName) => {
                const key = `${moduleName}:${actionName}`;
                const override = overrides.get(key);
                const current =
                  override === undefined ? "inherit" : override ? "grant" : "revoke";
                const inheritedLabel = roleAllowed.has(key)
                  ? t("permissions.granted")
                  : t("permissions.revoked");

                return (
                  <label key={key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted">
                      {t(ACTION_KEYS[actionName] as "permissions.view")}
                    </span>
                    <select
                      name={`cell:${key}`}
                      defaultValue={current}
                      className="min-h-12 rounded-xl border border-hairline bg-card px-2 text-sm font-semibold text-ink"
                    >
                      <option value="inherit">
                        {t("permissions.clearOverride")} ({inheritedLabel})
                      </option>
                      <option value="grant">{t("permissions.granted")}</option>
                      <option value="revoke">{t("permissions.revoked")}</option>
                    </select>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <Button type="submit" size="lg" disabled={pending} className="mt-4">
        {pending ? t("common.loading") : t("common.save")}
      </Button>
    </form>
  );
}
