import { workDateFor } from "@/lib/workday";

/** Days until a date-only value; negative once it has passed. */
export function daysUntil(date: Date, today: Date = workDateFor()): number {
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

export type ExpiryTone = "danger" | "pending" | "success";

/**
 * How a licence should read at a glance: overdue and due-inside-the-window are
 * different problems, and everything else should stay quiet.
 */
export function expiryTone(days: number, remindDaysBefore: number): ExpiryTone {
  if (days < 0) return "danger";
  if (days <= remindDaysBefore) return "pending";
  return "success";
}
