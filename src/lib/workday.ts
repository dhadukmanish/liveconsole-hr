/**
 * Everything here is anchored to India, not to the server.
 *
 * The host runs in UTC. Without this, a check-in at 9pm IST would be recorded
 * against the next UTC day, and "today's attendance" would look empty to the
 * person who just checked in. India has no daylight saving, so a fixed +05:30
 * offset is correct all year.
 */
export const IST_OFFSET_MINUTES = 5 * 60 + 30;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** The same instant, shifted so its UTC fields read as India local time. */
function toIstFields(instant: Date): Date {
  return new Date(instant.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE);
}

/**
 * The working day an instant belongs to, as midnight UTC — which is how
 * Postgres `date` columns round-trip without drifting a day.
 */
export function workDateFor(instant: Date = new Date()): Date {
  const ist = toIstFields(instant);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** "2026-09-18" for a date-only value, safe to put in a date input. */
export function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parses "2026-09-18" from a date input into midnight UTC. */
export function fromDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "09:07" in India, for a stored timestamp. */
export function formatIstTime(instant: Date): string {
  const ist = toIstFields(instant);
  return `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
}

/** "18 Sep 2026" for a date-only value. */
export function formatDate(date: Date, locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Whole days between two date-only values, inclusive of both ends. */
export function inclusiveDayCount(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}

export function minutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** First day of the month a date-only value falls in. */
export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** First day of the financial year (April in India), for leave balances. */
export function startOfLeaveYear(date: Date = workDateFor()): Date {
  const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, 3, 1));
}
