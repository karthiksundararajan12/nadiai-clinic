/**
 * @fileoverview Pure "does this appointment row block a slot?" rule (no
 * I/O) — shared by AppointmentRepository.findTakenSlotStarts so it's
 * unit-testable independent of Supabase.
 */

/**
 * @param {{ status: string; hold_expires_at?: string|null }} row
 * @param {number} nowMs
 * @returns {boolean} true if this row should be treated as occupying its
 *   slot right now.
 *
 * Rules:
 * - `confirmed` always blocks.
 * - `payment_pending` blocks only while its hold hasn't expired yet
 *   (`hold_expires_at > now`). A missing `hold_expires_at` is treated as
 *   never-expiring (blocks indefinitely) rather than immediately available
 *   — the safer default for a legacy/malformed row.
 * - Every other non-cancelled/non-rescheduled status (`pending`, `no_show`,
 *   `completed`) keeps the pre-hold v1 behavior of blocking the slot; the
 *   spec only carves out an exception for expired PAYMENT_PENDING holds.
 *
 * Callers are expected to have already filtered out `cancelled` and
 * `rescheduled` rows (e.g. via the DB query) before applying this.
 */
export function isBlockingAppointmentRow(row, nowMs) {
  if (row.status === "confirmed") return true;
  if (row.status === "payment_pending") {
    if (!row.hold_expires_at) return true;
    return new Date(row.hold_expires_at).getTime() > nowMs;
  }
  return true;
}
