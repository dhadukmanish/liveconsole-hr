"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { uploadDocumentAction, type DocumentState } from "@/app/(app)/documents/actions";

export type DocumentTypeOption = {
  id: string;
  name: string;
  requiresNumber: boolean;
};

export function DocumentUploadForm({
  userId,
  types,
  maxLabel,
}: {
  userId: string;
  types: DocumentTypeOption[];
  maxLabel: string;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<DocumentState, FormData>(
    uploadDocumentAction,
    {},
  );
  const [typeId, setTypeId] = useState("");

  const selected = types.find((type) => type.id === typeId);

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />

      {state.error ? (
        <Alert tone="danger" className="mb-3">
          {state.error === "documents.fileTooLarge"
            ? t("documents.fileTooLarge", { max: maxLabel })
            : t(state.error)}
        </Alert>
      ) : null}
      {state.notice ? (
        <Alert tone="success" className="mb-3">
          {t(state.notice as "documents.uploaded")}
        </Alert>
      ) : null}

      <Field label={t("documents.type")} htmlFor="documentTypeId">
        <Select
          id="documentTypeId"
          name="documentTypeId"
          required
          value={typeId}
          onChange={(event) => setTypeId(event.target.value)}
        >
          <option value="" disabled>
            {t("documents.pickType")}
          </option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </Select>
      </Field>

      {selected?.requiresNumber ? (
        <Field label={t("documents.number")} htmlFor="documentNumber">
          <Input id="documentNumber" name="documentNumber" required autoComplete="off" />
        </Field>
      ) : null}

      <Field label={t("documents.file")} htmlFor="file" hint={maxLabel}>
        <Input
          id="file"
          name="file"
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="py-2"
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("common.loading") : t("common.upload")}
      </Button>
    </form>
  );
}
