"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardMuted } from "@/components/ui/card";
import {
  checkInAction,
  checkOutAction,
  type AttendanceState,
} from "@/app/(app)/attendance/actions";

/**
 * The one big primary action on Home. Shows exactly one button: check in, or
 * check out, or neither once the day is closed.
 */
export function CheckInCard({
  checkedInAt,
  checkedOutAt,
  workedLabel,
}: {
  checkedInAt: string | null;
  checkedOutAt: string | null;
  workedLabel: string | null;
}) {
  const t = useTranslations();
  const action = checkedInAt && !checkedOutAt ? checkOutAction : checkInAction;
  const [state, formAction, pending] = useActionState<AttendanceState, FormData>(action, {});

  const done = Boolean(checkedInAt && checkedOutAt);

  return (
    <form action={formAction}>
      {state.error ? (
        <Alert tone="danger" className="mb-3">
          {t(state.error)}
        </Alert>
      ) : null}
      {state.notice ? (
        <Alert tone="success" className="mb-3">
          {t(state.notice as "attendance.checkedIn")}
        </Alert>
      ) : null}

      {done ? (
        <div className="rounded-xl bg-success/10 px-4 py-3 text-center">
          <p className="text-sm font-bold text-success-ink">{t("attendance.dayComplete")}</p>
          <p className="mt-1 text-sm text-muted">
            {checkedInAt} — {checkedOutAt}
            {workedLabel ? ` · ${workedLabel}` : ""}
          </p>
        </div>
      ) : (
        <Button type="submit" size="lg" disabled={pending}>
          {pending
            ? t("common.loading")
            : checkedInAt
              ? t("attendance.checkOut")
              : t("attendance.checkIn")}
        </Button>
      )}

      {checkedInAt && !checkedOutAt ? (
        <CardMuted className="mt-2 text-center">
          {t("attendance.checkedInAt", { time: checkedInAt })}
        </CardMuted>
      ) : null}
    </form>
  );
}
