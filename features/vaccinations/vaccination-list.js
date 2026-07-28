/**
 * @fileoverview Vaccination list helpers — status filter + due-date range
 * mapping for the /vaccinations dashboard table, mirroring the shape of
 * features/booking/lib/payment-list.js.
 *
 * `due_date` is a plain `date` column (no timezone component), so unlike
 * payment-list.js's created_at range helpers this never needs
 * start/end-of-day ISO conversion — plain YYYY-MM-DD string bounds are
 * enough for a `date` column comparison.
 */

import { VACCINATION_STATUS, VACCINATION_STATUS_LABEL } from "./constants.js";

/** API/UI filter values → DB vaccination_schedules.status values */
export const VACCINATION_STATUS_FILTER = Object.freeze({
  ALL: "all",
  PENDING: VACCINATION_STATUS.PENDING,
  REMINDER_SENT: VACCINATION_STATUS.REMINDER_SENT,
  COMPLETED: VACCINATION_STATUS.COMPLETED,
  OVERDUE: VACCINATION_STATUS.OVERDUE,
});

/**
 * @param {string|null|undefined} status
 * @returns {string}
 */
export function formatVaccinationStatusLabel(status) {
  if (!status) return "—";
  return VACCINATION_STATUS_LABEL[status] ?? status;
}

/**
 * @param {string|null|undefined} filterStatus
 * @returns {string|null} DB status to eq-filter, or null for "all"
 */
export function vaccinationStatusFilterToDb(filterStatus) {
  const s = String(filterStatus ?? "all").toLowerCase();
  if (!s || s === VACCINATION_STATUS_FILTER.ALL) return null;
  return Object.values(VACCINATION_STATUS).includes(s) ? s : null;
}

/** @param {Date} date @returns {string} YYYY-MM-DD in Asia/Kolkata */
function istDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Resolves a `range` filter into due_date bounds. Note this is
 * deliberately forward-looking ("week"/"month" = due in the next N days),
 * unlike payment-list.js's backward-looking range (created in the last N
 * days) — appropriate for a due-date reminder table where staff care about
 * what's coming up, not what already happened.
 *
 * @param {string} rangeKey today|week|month|custom|overdue|all
 * @param {{ from?: string|null; to?: string|null; now?: Date }} [opts]
 * @returns {{ fromDate: string|null; toDate: string|null }}
 */
export function resolveVaccinationDueDateRange(rangeKey, { from = null, to = null, now = new Date() } = {}) {
  const key = String(rangeKey ?? "all").toLowerCase();
  if (key === "custom") {
    return { fromDate: from || null, toDate: to || null };
  }
  const today = istDateKey(now);
  if (key === "today") {
    return { fromDate: today, toDate: today };
  }
  if (key === "week") {
    const end = istDateKey(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
    return { fromDate: today, toDate: end };
  }
  if (key === "month") {
    const end = istDateKey(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
    return { fromDate: today, toDate: end };
  }
  if (key === "overdue") {
    return { fromDate: null, toDate: today };
  }
  return { fromDate: null, toDate: null };
}
