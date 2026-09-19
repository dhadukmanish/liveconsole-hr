"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  createMasterAction,
  deleteMasterAction,
  toggleMasterActiveAction,
  type MasterKind,
  type SettingsState,
} from "@/app/(app)/settings/actions";

export type MasterRow = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  sortOrder: number;
  detail?: string;
  colour?: string;
};

/** One editor shared by all five masters; extra fields are declared per kind. */
export function MasterEditor({
  kind,
  title,
  rows,
  extras,
  canEdit,
  canDelete,
}: {
  kind: MasterKind;
  title: string;
  rows: MasterRow[];
  extras?: { name: string; label: string; type: "checkbox" | "number" | "colour" }[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    createMasterAction,
    {},
  );

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-muted uppercase">{title}</h2>

      <ul className="mb-4 flex flex-col gap-2">
        {rows.map((row) => (
          /* Name above, actions below. Side by side on a phone the name got a
             third of the width and "Education certificate" came out as
             "Education certi…" — and Delete ended up a thumb's width from the
             Active toggle. From 640px there is room for one row again. */
          <li
            key={row.id}
            className="flex flex-col gap-2 rounded-xl border border-hairline bg-card p-3 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="flex min-w-0 flex-1 items-start gap-2">
              {row.colour ? (
                <span
                  aria-hidden
                  className="mt-1 h-4 w-4 shrink-0 rounded-full border border-hairline"
                  style={{ backgroundColor: row.colour }}
                />
              ) : null}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {row.name}{" "}
                  <span className="font-mono text-xs text-muted">{row.code}</span>
                </p>
                {row.detail ? <p className="text-xs text-muted">{row.detail}</p> : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {canEdit ? (
                <form action={toggleMasterActiveAction}>
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="isActive" value={row.isActive ? "false" : "true"} />
                  <Button type="submit" variant="secondary" className="text-xs">
                    {row.isActive ? t("common.active") : t("common.inactive")}
                  </Button>
                </form>
              ) : (
                <span className="text-xs font-semibold text-muted">
                  {row.isActive ? t("common.active") : t("common.inactive")}
                </span>
              )}

              {canDelete ? (
                <form
                  action={deleteMasterAction}
                  // Delete sits next to a toggle you press all the time, and a
                  // master this app has already written into records is not
                  // something to lose to a mis-tap.
                  onSubmit={(event) => {
                    if (!window.confirm(t("settings.confirmDelete", { name: row.name }))) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="id" value={row.id} />
                  <Button
                    type="submit"
                    variant="secondary"
                    className="text-xs text-danger-ink hover:border-danger"
                  >
                    {t("common.delete")}
                  </Button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {canEdit ? (
        <form action={formAction} className="rounded-xl border border-hairline bg-card p-3">
          <input type="hidden" name="kind" value={kind} />

          {state.error ? (
            <Alert tone="danger" className="mb-3">
              {state.error.includes(".") ? t(state.error) : state.error}
            </Alert>
          ) : null}
          {state.notice ? (
            <Alert tone="success" className="mb-3">
              {t(state.notice as "common.saved")}
            </Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("settings.name")} htmlFor={`${kind}-name`}>
              <Input id={`${kind}-name`} name="name" required maxLength={80} />
            </Field>
            <Field label={t("settings.code")} htmlFor={`${kind}-code`}>
              <Input id={`${kind}-code`} name="code" required maxLength={30} className="font-mono" />
            </Field>
            <Field label={t("settings.sortOrder")} htmlFor={`${kind}-sort`}>
              <Input id={`${kind}-sort`} name="sortOrder" type="number" min={0} defaultValue={0} />
            </Field>
          </div>

          {extras?.length ? (
            <div className="mb-3 flex flex-wrap items-center gap-4">
              {extras.map((extra) =>
                extra.type === "checkbox" ? (
                  <label key={extra.name} className="flex min-h-12 items-center gap-3 text-sm text-ink">
                    <input
                      type="checkbox"
                      name={extra.name}
                      className="h-6 w-6 shrink-0 accent-[var(--brand)]"
                    />
                    {extra.label}
                  </label>
                ) : (
                  <label key={extra.name} className="flex min-h-12 items-center gap-3 text-sm text-ink">
                    {extra.label}
                    <Input
                      name={extra.name}
                      type={extra.type === "colour" ? "text" : "number"}
                      min={extra.type === "number" ? 0 : undefined}
                      placeholder={extra.type === "colour" ? "#F7941D" : undefined}
                      className="w-32"
                    />
                  </label>
                ),
              )}
            </div>
          ) : null}

          <Button type="submit" size="lg" disabled={pending}>
            {pending ? t("common.loading") : t("settings.addItem")}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
