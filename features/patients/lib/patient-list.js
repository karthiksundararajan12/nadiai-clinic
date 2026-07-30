/**
 * @fileoverview Patients list helpers — thin alias over the payments
 * date-range helper (features/booking/lib/payment-list.js), the same way
 * features/booking/lib/appointment-list.js aliases it for the appointments
 * dashboard list. Patients don't have their own "range" concept — the
 * dashboard filters by when a patient was registered (`created_at`), which
 * is the same IST day-bucket logic payments already uses for its own
 * `created_at` filter.
 */
import { resolvePaymentDateRange, escapeIlikePattern } from "../../booking/lib/payment-list.js";

/**
 * @param {string|null|undefined} rangeKey
 * @param {{ from?: string|null; to?: string|null; now?: Date }} [opts]
 * @returns {{ fromIso: string|null; toIso: string|null }}
 */
export function resolvePatientRegisteredDateRange(rangeKey, opts = {}) {
  return resolvePaymentDateRange(rangeKey, opts);
}

export { escapeIlikePattern };
