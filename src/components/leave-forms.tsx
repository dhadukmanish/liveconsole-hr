"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  applyLeaveAction,
  decideLeaveAction,
  type LeaveState,
} from "@/app/(app)/leave/actions";

export type LeaveTypeOption = { id: string; name: string; requiresApproval: boolean };

export function ApplyLeaveForm({
  types,
  today,
}: {
  types: LeaveTypeOption[];
  today: string;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<LeaveState, FormData>(
    applyLeaveAction,
    {},
  );
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);

  // A half day only makes sense on a single-day request.
  const sameDay = start === end;

  return (
    <form action={formAction}>
      {state.error ? (
        <Alert tone="danger" className="mb-3">
          {t(state.error)}
        </Alert>
      ) : null}
      {state.notice ? (
        <Alert tone="success" className="mb-3">
          {t(state.notice as "leave.applied")}
        </Alert>
      ) : null}

      <Field label={t("leave.type")} htmlFor="leaveTypeId">
        <Select id="leaveTypeId" name="leaveTypeId" required defaultValue="">
          <option value="" disabled>
            {t("leave.pickType")}
          </option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
              {type.requiresApproval ? "" : ` — ${t("leave.noApprovalNeeded")}`}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("leave.from")} htmlFor="startDate">
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              if (event.target.value > end) setEnd(event.target.value);
            }}
          />
        </Field>
        <Field label={t("leave.to")} htmlFor="endDate">
          <Input
            id="endDate"
            name="endDate"
            type="date"
            required
            min={start}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </Field>
      </div>

      {sameDay ? (
        <label className="mb-4 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="isHalfDay"
            className="h-5 w-5 accent-[var(--brand)]"
          />
          {t("leave.halfDay")}
        </label>
      ) : null}

      <Field label={t("leave.reason")} htmlFor="reason">
        <Textarea id="reason" name="reason" required minLength={5} maxLength={500} />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("common.loading") : t("leave.apply")}
      </Button>
    </form>
  );
}

/** Approve or reject, with an optional note, on one pending request. */
export function LeaveDecision({ requestId }: { requestId: string }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<LeaveState, FormData>(
    decideLeaveAction,
    {},
  );

  return (
    <form action={formAction} className="mt-3 border-t border-hairline pt-3">
      <input type="hidden" name="requestId" value={requestId} />

      {state.error ? (
        <Alert tone="danger" className="mb-2">
          {t(state.error)}
        </Alert>
      ) : null}

      <Input
        name="note"
        placeholder={t("leave.decisionNote")}
        maxLength={500}
        className="mb-2"
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          name="decision"
          value="APPROVED"
          variant="success"
          disabled={pending}
          className="flex-1"
        >
          {t("leave.approve")}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="REJECTED"
          variant="danger"
          disabled={pending}
          className="flex-1"
        >
          {t("leave.reject")}
        </Button>
      </div>
    </form>
  );
}
