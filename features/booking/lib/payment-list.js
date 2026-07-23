/**
 * @fileoverview Payment list helpers — appointments are the payment source of
 * truth (no dedicated payments table). UI status labels map from
 * appointments.payment_status.
 */

/** API/UI filter values → DB payment_status values */
export const PAYMENT_STATUS_FILTER = Object.freeze({
  ALL: "all",
  CAPTURED: "captured",
  FAILED: "failed",
  REFUNDED: "refunded",
  PENDING: "pending",
});

/** DB payment_status → display label used in the Payments table */
export const PAYMENT_STATUS_LABEL = Object.freeze({
  paid: "Captured",
  failed: "Failed",
  refunded: "Refunded",
  pending: "Pending",
});

/**
 * @param {string|null|undefined} dbStatus
 * @returns {string}
 */
export function formatPaymentStatusLabel(dbStatus) {
  if (!dbStatus) return "—";
  return PAYMENT_STATUS_LABEL[dbStatus] ?? dbStatus;
}

/**
 * Maps API filter status to DB `payment_status` value(s).
 * `captured` is the product term for Razorpay payment.captured → DB `paid`.
 *
 * @param {string|null|undefined} filterStatus
 * @returns {string|null} DB status to eq-filter, or null for "all"
 */
export function paymentStatusFilterToDb(filterStatus) {
  const s = String(filterStatus ?? "all").toLowerCase();
  if (!s || s === PAYMENT_STATUS_FILTER.ALL) return null;
  if (s === PAYMENT_STATUS_FILTER.CAPTURED || s === "paid") return "paid";
  if (s === PAYMENT_STATUS_FILTER.FAILED) return "failed";
  if (s === PAYMENT_STATUS_FILTER.REFUNDED) return "refunded";
  if (s === PAYMENT_STATUS_FILTER.PENDING) return "pending";
  return null;
}

/**
 * Escapes `%` / `_` for safe ILIKE patterns.
 * @param {string} raw
 * @returns {string}
 */
export function escapeIlikePattern(raw) {
  return String(raw).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * @param {string} rangeKey today|week|month|custom|all
 * @param {{ from?: string|null; to?: string|null; now?: Date }} [opts]
 * @returns {{ fromIso: string|null; toIso: string|null }}
 */
export function resolvePaymentDateRange(rangeKey, { from = null, to = null, now = new Date() } = {}) {
  const key = String(rangeKey ?? "all").toLowerCase();
  if (key === "custom") {
    return {
      fromIso: from ? startOfDayIstIso(from) : null,
      toIso: to ? endOfDayIstIso(to) : null,
    };
  }
  if (key === "today") {
    const day = istCalendarDate(now);
    return { fromIso: startOfDayIstIso(day), toIso: endOfDayIstIso(day) };
  }
  if (key === "week") {
    const end = istCalendarDate(now);
    const startDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const start = istCalendarDate(startDate);
    return { fromIso: startOfDayIstIso(start), toIso: endOfDayIstIso(end) };
  }
  if (key === "month") {
    const end = istCalendarDate(now);
    const parts = end.split("-").map(Number);
    const start = `${parts[0]}-${String(parts[1]).padStart(2, "0")}-01`;
    return { fromIso: startOfDayIstIso(start), toIso: endOfDayIstIso(end) };
  }
  return { fromIso: null, toIso: null };
}

/** @param {Date} date @returns {string} YYYY-MM-DD in Asia/Kolkata */
function istCalendarDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** @param {string} ymd YYYY-MM-DD */
function startOfDayIstIso(ymd) {
  return new Date(`${ymd}T00:00:00+05:30`).toISOString();
}

/** @param {string} ymd YYYY-MM-DD — exclusive end = next day start, but we use inclusive end-of-day */
function endOfDayIstIso(ymd) {
  return new Date(`${ymd}T23:59:59.999+05:30`).toISOString();
}
