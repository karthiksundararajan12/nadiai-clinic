/**
 * @fileoverview Appointment list helpers for the dashboard table
 * (mirrors features/booking/lib/payment-list.js).
 */

import {
  escapeIlikePattern,
  resolvePaymentDateRange,
} from "./payment-list.js";

/** API/UI filter values for appointments.status */
export const APPOINTMENT_STATUS_FILTER = Object.freeze({
  ALL: "all",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  RESCHEDULED: "rescheduled",
});

/** DB appointment status → display label */
export const APPOINTMENT_STATUS_LABEL = Object.freeze({
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  rescheduled: "Rescheduled",
  pending: "Pending",
  payment_pending: "Payment Pending",
  reschedule_requested: "Reschedule Requested",
  no_show: "No Show",
});

/** DB refund_status → display label */
export const REFUND_STATUS_LABEL = Object.freeze({
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  not_applicable: "N/A",
});

/**
 * @param {string|null|undefined} dbStatus
 * @returns {string}
 */
export function formatAppointmentStatusLabel(dbStatus) {
  if (!dbStatus) return "—";
  return APPOINTMENT_STATUS_LABEL[dbStatus] ?? dbStatus;
}

/**
 * @param {string|null|undefined} filterStatus
 * @returns {string|null} DB status to eq-filter, or null for "all"
 */
export function appointmentStatusFilterToDb(filterStatus) {
  const s = String(filterStatus ?? "all").toLowerCase();
  if (!s || s === APPOINTMENT_STATUS_FILTER.ALL) return null;
  if (
    s === APPOINTMENT_STATUS_FILTER.CONFIRMED ||
    s === APPOINTMENT_STATUS_FILTER.CANCELLED ||
    s === APPOINTMENT_STATUS_FILTER.COMPLETED ||
    s === APPOINTMENT_STATUS_FILTER.RESCHEDULED
  ) {
    return s;
  }
  return null;
}

/**
 * @param {string|null|undefined} refundStatus
 * @returns {string}
 */
export function formatRefundStatusLabel(refundStatus) {
  if (!refundStatus) return "—";
  return REFUND_STATUS_LABEL[refundStatus] ?? refundStatus;
}

/**
 * Date range for filtering on appointment slot_start (IST), same bounds
 * helper as payments (which filters on created_at).
 *
 * @param {string|null|undefined} rangeKey
 * @param {{ from?: string|null; to?: string|null; now?: Date }} [opts]
 * @returns {{ fromIso: string|null; toIso: string|null }}
 */
export function resolveAppointmentSlotDateRange(rangeKey, opts = {}) {
  return resolvePaymentDateRange(rangeKey, opts);
}

export { escapeIlikePattern };
