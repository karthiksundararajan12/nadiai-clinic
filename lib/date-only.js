/**
 * @fileoverview Formats a date-only value (a Postgres `date` column such as
 * patients.date_of_birth or vaccination_schedules.due_date — a plain
 * "YYYY-MM-DD" string with no timezone component) for display.
 *
 * Never round-trip a date-only string through `new Date(dateOnlyString)` +
 * local-timezone formatting (e.g. date-fns `format`) — `new Date("2026-01-01")`
 * parses as UTC midnight, and formatting that in whichever timezone the
 * browser/server happens to be in can silently shift the displayed
 * calendar date by a day (most visibly in negative-UTC-offset timezones).
 * Originally fixed for the /vaccinations due-date column
 * (see app/(dashboard)/vaccinations/page.js); extracted here so every
 * date-only column (patient date_of_birth, vaccination due_date, …) shares
 * one implementation instead of re-copying the same fix.
 */

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * @param {string|null|undefined} value "YYYY-MM-DD", optionally followed by
 *   a time/offset component (which is ignored — only the date digits matter).
 * @returns {string} e.g. "01 Jan 2026", or "—" when value is empty/unparseable.
 */
export function formatDateOnly(value) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return String(value);
  const [, year, month, day] = match;
  const monthLabel = MONTH_LABELS[Number(month) - 1];
  if (!monthLabel) return String(value);
  return `${String(Number(day)).padStart(2, "0")} ${monthLabel} ${year}`;
}
