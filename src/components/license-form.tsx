"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { LicenseState } from "@/app/(app)/licenses/actions";

export type LicenseDefaults = {
  id?: string;
  name?: string;
  vendor?: string | null;
  licenseNumber?: string | null;
  startDate?: string | null;
  expiryDate?: string;
  cost?: number | null;
  ownerId?: string | null;
  remindDaysBefore?: number;
  notes?: string | null;
};

export function LicenseForm({
  action,
  people,
  defaults = {},
  submitLabelKey,
}: {
  action: (state: LicenseState, formData: FormData) => Promise<LicenseState>;
  people: { id: string; name: string }[];
  defaults?: LicenseDefaults;
  submitLabelKey: string;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<LicenseState, FormData>(action, {});

  return (
    <form action={formAction}>
      {defaults.id ? <input type="hidden" name="licenseId" value={defaults.id} /> : null}

      {state.error ? (
        <Alert tone="danger" className="mb-3">
          {t(state.error)}
        </Alert>
      ) : null}
      {state.notice ? (
        <Alert tone="success" className="mb-3">
          {t(state.notice as "common.saved")}
        </Alert>
      ) : null}

      <Field label={t("licenses.name")} htmlFor="name">
        <Input id="name" name="name" required minLength={2} maxLength={120} defaultValue={defaults.name ?? ""} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("licenses.vendor")} htmlFor="vendor">
          <Input id="vendor" name="vendor" maxLength={120} defaultValue={defaults.vendor ?? ""} />
        </Field>

        <Field label={t("licenses.licenseNumber")} htmlFor="licenseNumber">
          <Input
            id="licenseNumber"
            name="licenseNumber"
            maxLength={80}
            defaultValue={defaults.licenseNumber ?? ""}
          />
        </Field>

        <Field label={t("licenses.startDate")} htmlFor="startDate">
          <Input id="startDate" name="startDate" type="date" defaultValue={defaults.startDate ?? ""} />
        </Field>

        <Field label={t("licenses.expiryDate")} htmlFor="expiryDate">
          <Input
            id="expiryDate"
            name="expiryDate"
            type="date"
            required
            defaultValue={defaults.expiryDate ?? ""}
          />
        </Field>

        <Field label={t("licenses.owner")} htmlFor="ownerId" hint={t("licenses.ownerHint")}>
          <Select id="ownerId" name="ownerId" defaultValue={defaults.ownerId ?? ""}>
            <option value="">{t("licenses.noOwner")}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("licenses.remindDaysBefore")} htmlFor="remindDaysBefore">
          <Input
            id="remindDaysBefore"
            name="remindDaysBefore"
            type="number"
            min={0}
            max={365}
            inputMode="numeric"
            defaultValue={defaults.remindDaysBefore ?? 30}
          />
        </Field>

        <Field label={t("licenses.cost")} htmlFor="cost">
          <Input
            id="cost"
            name="cost"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            defaultValue={defaults.cost ?? ""}
          />
        </Field>
      </div>

      <Field label={t("licenses.notes")} htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} maxLength={500} defaultValue={defaults.notes ?? ""} />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("common.loading") : t(submitLabelKey as "common.save")}
      </Button>
    </form>
  );
}
