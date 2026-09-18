"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { ContactState } from "@/app/(app)/phonebook/actions";

export type ContactDefaults = {
  id?: string;
  name?: string;
  phone?: string;
  altPhone?: string | null;
  company?: string | null;
  designation?: string | null;
  email?: string | null;
  category?: string | null;
  address?: string | null;
  notes?: string | null;
};

export function ContactForm({
  action,
  defaults = {},
  categories = [],
  submitLabelKey,
}: {
  action: (state: ContactState, formData: FormData) => Promise<ContactState>;
  defaults?: ContactDefaults;
  categories?: string[];
  submitLabelKey: string;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<ContactState, FormData>(action, {});

  return (
    <form action={formAction}>
      {defaults.id ? <input type="hidden" name="contactId" value={defaults.id} /> : null}

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

      <Field label={t("phonebook.name")} htmlFor="name">
        <Input id="name" name="name" required minLength={2} maxLength={120} defaultValue={defaults.name ?? ""} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("phonebook.phone")} htmlFor="phone">
          {/* type=tel, not number: leading zeros, +91 and extensions all matter. */}
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            minLength={5}
            maxLength={30}
            inputMode="tel"
            defaultValue={defaults.phone ?? ""}
          />
        </Field>

        <Field label={t("phonebook.altPhone")} htmlFor="altPhone">
          <Input
            id="altPhone"
            name="altPhone"
            type="tel"
            maxLength={30}
            inputMode="tel"
            defaultValue={defaults.altPhone ?? ""}
          />
        </Field>

        <Field label={t("phonebook.company")} htmlFor="company">
          <Input id="company" name="company" maxLength={120} defaultValue={defaults.company ?? ""} />
        </Field>

        <Field label={t("phonebook.designation")} htmlFor="designation">
          <Input
            id="designation"
            name="designation"
            maxLength={80}
            defaultValue={defaults.designation ?? ""}
          />
        </Field>

        <Field label={t("phonebook.email")} htmlFor="email">
          <Input id="email" name="email" type="email" maxLength={160} defaultValue={defaults.email ?? ""} />
        </Field>

        <Field label={t("phonebook.category")} htmlFor="category" hint={t("phonebook.categoryHint")}>
          {/* Free text with the existing values offered, so the list stays
              tidy without forcing anyone into a master screen. */}
          <Input
            id="category"
            name="category"
            list="contact-categories"
            maxLength={60}
            defaultValue={defaults.category ?? ""}
          />
          <datalist id="contact-categories">
            {categories.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field label={t("phonebook.address")} htmlFor="address">
        <Textarea id="address" name="address" rows={2} maxLength={300} defaultValue={defaults.address ?? ""} />
      </Field>

      <Field label={t("phonebook.notes")} htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} maxLength={500} defaultValue={defaults.notes ?? ""} />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("common.loading") : t(submitLabelKey as "common.save")}
      </Button>
    </form>
  );
}
