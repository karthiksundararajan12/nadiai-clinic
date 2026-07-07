/**
 * @fileoverview AppointmentRepository — data access for public.appointments
 * needed by SLOT_SELECTION.
 *
 * Race-condition safety: `appointments_no_double_booking` is a partial
 * unique index on (doctor_id, slot_start) WHERE status NOT IN ('cancelled',
 * 'rescheduled') — already present on the live DB (confirmed via Supabase
 * MCP before this session). `createIfAvailable` relies on that DB-level
 * constraint rather than a check-then-insert race, per the spec ("use a
 * DB-level constraint or transaction, not just an application-level
 * check").
 *
 * PAYMENT_PENDING holds & expiry (`hold_expires_at`, migration 019): the
 * spec asks for expired holds to free up their slot again "via a
 * query-level filter, not a background job" — but the unique index above
 * can't encode that directly, because Postgres partial-index predicates
 * must be IMMUTABLE and `hold_expires_at > now()` isn't. So expiry is
 * handled in two places instead:
 *   1. Read side (`findTakenSlotStarts`): rows are fetched and filtered in
 *      application code via `isBlockingAppointmentRow`, which treats an
 *      expired PAYMENT_PENDING hold as non-blocking — so it's simply never
 *      offered as "taken" once expired.
 *   2. Write side (`createIfAvailable`): immediately before every insert
 *      attempt, `_releaseExpiredHold` issues an idempotent UPDATE that
 *      flips any expired PAYMENT_PENDING row for this exact (doctor_id,
 *      slot_start) to `cancelled` — which removes it from the unique
 *      index's partial predicate — so the DB-level constraint remains the
 *      actual source of truth for whether the insert can proceed. If this
 *      release UPDATE fails, it's logged and swallowed (never thrown): the
 *      insert simply falls through to the unique index as before, which
 *      can only be *too strict* (a real conflict correctly reported), never
 *      *too permissive* — i.e. failure here can't cause a double-booking.
 *
 * Razorpay webhook confirm/release (`confirmPayment`, `releaseFailedHold`,
 * migration 020's idempotency ledger is the first line of defense — see
 * PaymentWebhookService): both methods do a single conditional UPDATE
 * scoped by `status = 'payment_pending'` (plus, for confirm, an unexpired
 * hold) rather than a read-then-write, so a late/duplicate webhook can
 * never clobber a row that's already moved on. Zero rows matched is a
 * valid, common outcome (not an error) — the caller re-reads separately
 * only for diagnostic logging.
 */

import { DatabaseError } from "../errors.js";
import { BaseRepository } from "./base.repository.js";
import { isBlockingAppointmentRow } from "../lib/appointment-availability.js";

const NO_DOUBLE_BOOKING_CONSTRAINT = "appointments_no_double_booking";
const WA_MESSAGE_ID_CONSTRAINT = "appointments_wa_message_id_key";
const UNIQUE_VIOLATION_CODE = "23505";
const NOT_FOUND_CODE = "PGRST116";
const EXPIRED_HOLD_CANCELLATION_REASON = "hold_expired";
const PAYMENT_FAILED_CANCELLATION_REASON = "payment_failed";

/** @typedef {"SLOT_TAKEN"|"DUPLICATE_MESSAGE"|"UNKNOWN_CONFLICT"} AppointmentInsertConflict */

function matchesConstraint(error, constraintName) {
  return typeof error?.message === "string" && error.message.includes(constraintName);
}

export class AppointmentRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "appointments");
  }

  /**
   * Slot start timestamps already booked for this doctor within a window,
   * used to filter candidate slots before they're ever shown — the DB
   * constraint in `createIfAvailable` is still the source of truth for
   * correctness, this is just to avoid offering slots we already know are
   * taken. A CONFIRMED appointment always blocks; a PAYMENT_PENDING one
   * only blocks while its hold hasn't expired yet (see this file's header
   * comment) — filtered via `isBlockingAppointmentRow` rather than in SQL,
   * since the result set here is already bounded to one doctor's slots
   * over a ~week window (small enough that in-app filtering has no real
   * cost, and it keeps this logic unit-testable without a live DB).
   *
   * @param {string} clinicId
   * @param {string} doctorId
   * @param {string} fromIso
   * @param {string} toIso
   * @returns {Promise<string[]>}
   */
  async findTakenSlotStarts(clinicId, doctorId, fromIso, toIso) {
    const rows = await this._run(
      () =>
        this._db
          .from(this._table)
          .select("slot_start, status, hold_expires_at")
          .eq("clinic_id", clinicId)
          .eq("doctor_id", doctorId)
          .is("deleted_at", null)
          .not("status", "in", "(cancelled,rescheduled)")
          .gte("slot_start", fromIso)
          .lt("slot_start", toIso),
      "findTakenSlotStarts",
    );
    const now = Date.now();
    return rows.filter((row) => isBlockingAppointmentRow(row, now)).map((row) => row.slot_start);
  }

  /**
   * Appointments for this patient whose window overlaps [slotStartIso,
   * slotEndIso) and are currently CONFIRMED — used for the "already has a
   * confirmed appointment in an overlapping window" warning.
   *
   * @param {string} clinicId
   * @param {string} patientId
   * @param {string} slotStartIso
   * @param {string} slotEndIso
   * @returns {Promise<Array<{ id: string; slot_start: string; slot_end: string }>>}
   */
  async findOverlappingConfirmedForPatient(clinicId, patientId, slotStartIso, slotEndIso) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .select("id, slot_start, slot_end")
          .eq("clinic_id", clinicId)
          .eq("patient_id", patientId)
          .eq("status", "confirmed")
          .is("deleted_at", null)
          .lt("slot_start", slotEndIso)
          .gt("slot_end", slotStartIso),
      "findOverlappingConfirmedForPatient",
    );
  }

  /**
   * Attempts to create an appointment for exactly this slot. Never does a
   * check-then-insert — relies entirely on the DB's partial unique index to
   * resolve the race atomically (after first lazily releasing this exact
   * slot's hold if it's expired — see this file's header comment). Callers
   * must branch on `conflict`, not treat every non-success as an
   * unexpected error.
   *
   * @param {{
   *   clinic_id: string; doctor_id: string; patient_id: string;
   *   contact_phone: string; slot_start: string; slot_end: string;
   *   status: string; wa_message_id: string;
   *   payment_status?: string; payment_amount?: number|null;
   *   hold_expires_at?: string|null;
   * }} data
   * @returns {Promise<{ row: object|null; conflict: AppointmentInsertConflict|null }>}
   */
  async createIfAvailable(data) {
    await this._releaseExpiredHold(data.doctor_id, data.slot_start);

    const { data: row, error } = await this._db
      .from(this._table)
      .insert(data)
      .select("*")
      .single();

    if (!error) return { row, conflict: null };

    if (error.code === UNIQUE_VIOLATION_CODE) {
      if (matchesConstraint(error, NO_DOUBLE_BOOKING_CONSTRAINT)) {
        this._log.warn("Slot booking race lost — slot already taken", {
          doctorId: data.doctor_id,
          slotStart: data.slot_start,
        });
        return { row: null, conflict: "SLOT_TAKEN" };
      }
      if (matchesConstraint(error, WA_MESSAGE_ID_CONSTRAINT)) {
        this._log.warn("wa_message_id unique violation on appointment insert — likely a webhook redelivery", {
          waMessageId: data.wa_message_id,
        });
        return { row: null, conflict: "DUPLICATE_MESSAGE" };
      }
      this._log.error("Unrecognized unique violation on appointment insert", {
        code: error.code,
        message: error.message,
      });
      return { row: null, conflict: "UNKNOWN_CONFLICT" };
    }

    this._log.error("DB error during createIfAvailable", {
      table: this._table,
      code: error.code,
      details: error.details,
    });
    throw new DatabaseError("createIfAvailable", error);
  }

  /**
   * Idempotent lazy-expiry step run immediately before every booking
   * attempt (see this file's header comment for why this exists instead
   * of a background job or an index predicate on `now()`). A no-op if
   * there's nothing expired for this exact (doctor_id, slot_start).
   * Never throws — a failure here just means the slot won't be reclaimed
   * on this attempt; the unique index below is still the real safety net.
   *
   * @param {string} doctorId
   * @param {string} slotStart
   * @returns {Promise<void>}
   */
  async _releaseExpiredHold(doctorId, slotStart) {
    const nowIso = new Date().toISOString();
    const { error } = await this._db
      .from(this._table)
      .update({ status: "cancelled", cancellation_reason: EXPIRED_HOLD_CANCELLATION_REASON, cancelled_at: nowIso })
      .eq("doctor_id", doctorId)
      .eq("slot_start", slotStart)
      .eq("status", "payment_pending")
      .not("hold_expires_at", "is", null)
      .lte("hold_expires_at", nowIso)
      .is("deleted_at", null);

    if (error) {
      this._log.error("Failed to release an expired slot hold before a booking attempt — falling through to the unique index unchanged", {
        doctorId,
        slotStart,
        code: error.code,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Razorpay webhook — PAYMENT_PENDING -> CONFIRMED / released-on-failure
  // ─────────────────────────────────────────────────────────────

  /**
   * Read-only lookup used by PaymentWebhookService purely for diagnostic
   * logging when `confirmPayment`/`releaseFailedHold` match zero rows
   * (never for a decision that could race — those two methods are
   * self-contained atomic UPDATEs).
   *
   * @param {string} clinicId
   * @param {string} appointmentId
   * @returns {Promise<object|null>}
   */
  async findByIdForClinic(clinicId, appointmentId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select("*")
          .eq("id", appointmentId)
          .eq("clinic_id", clinicId)
          .is("deleted_at", null)
          .single(),
      "findByIdForClinic",
    );
  }

  /**
   * Confirms a PAYMENT_PENDING appointment after a verified Razorpay
   * "payment.captured" event. A single conditional UPDATE — never a
   * read-then-write — so a late/duplicate webhook can't confirm a hold
   * that has since expired or already moved on. Matches zero rows (returns
   * null, not an error) when the appointment is no longer PAYMENT_PENDING,
   * or its hold has already expired: per spec, that's a "late/expired
   * payment" the caller must log for manual reconciliation, not confirm.
   *
   * A `hold_expires_at IS NULL` row (legacy/never-expiring, per
   * isBlockingAppointmentRow's read-path semantics) is treated as not yet
   * expired here too, for consistency with that same rule.
   *
   * @param {string} clinicId
   * @param {string} appointmentId
   * @param {string} razorpayPaymentId
   * @returns {Promise<object|null>} the updated row, or null if the guarded
   *   UPDATE matched nothing.
   */
  async confirmPayment(clinicId, appointmentId, razorpayPaymentId) {
    const nowIso = new Date().toISOString();
    const { data, error } = await this._db
      .from(this._table)
      .update({
        status:              "confirmed",
        payment_status:      "paid",
        razorpay_payment_id: razorpayPaymentId,
        hold_expires_at:     null,
        updated_at:          nowIso,
      })
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .eq("status", "payment_pending")
      .or(`hold_expires_at.is.null,hold_expires_at.gt.${nowIso}`)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (!error) return data;
    if (error.code === NOT_FOUND_CODE) return null;
    if (error.code === UNIQUE_VIOLATION_CODE) {
      // razorpay_payment_id is unique (ARCHITECTURE.md's idempotency rule) —
      // a violation here means this exact payment id was already recorded
      // on some appointment. Treat as an already-handled replay rather than
      // a hard failure.
      this._log.warn("razorpay_payment_id unique violation on confirmPayment — treating as an already-processed replay", {
        appointmentId,
        razorpayPaymentId,
      });
      return null;
    }

    this._log.error("DB error during confirmPayment", { appointmentId, code: error.code });
    throw new DatabaseError("confirmPayment", error);
  }

  /**
   * Releases a PAYMENT_PENDING hold after a verified Razorpay
   * "payment.failed" event — cancels the appointment (freeing the slot the
   * same way any other cancellation does) rather than leaving it dangling
   * in PAYMENT_PENDING. Zero rows matched (returns null) means there was
   * nothing to release (already confirmed/cancelled/expired-and-reclaimed
   * elsewhere) — a legitimate no-op, not an error.
   *
   * @param {string} clinicId
   * @param {string} appointmentId
   * @returns {Promise<object|null>}
   */
  async releaseFailedHold(clinicId, appointmentId) {
    const nowIso = new Date().toISOString();
    const { data, error } = await this._db
      .from(this._table)
      .update({
        status:              "cancelled",
        payment_status:      "failed",
        cancellation_reason: PAYMENT_FAILED_CANCELLATION_REASON,
        cancelled_at:        nowIso,
        hold_expires_at:     null,
        updated_at:          nowIso,
      })
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .eq("status", "payment_pending")
      .is("deleted_at", null)
      .select("*")
      .single();

    if (!error) return data;
    if (error.code === NOT_FOUND_CODE) return null;

    this._log.error("DB error during releaseFailedHold", { appointmentId, code: error.code });
    throw new DatabaseError("releaseFailedHold", error);
  }
}
