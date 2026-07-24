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
 *
 * Session 5 (REMINDER_SENT — see ReminderService): `findDueForReminder`
 * and `claimReminder`/`cancelViaReminderReply`/`requestRescheduleViaReminderReply`
 * follow the exact same "atomic conditional UPDATE, never read-then-write"
 * discipline as the Razorpay methods above — a redelivered/duplicate
 * WhatsApp webhook or an overlapping cron run can never double-send a
 * reminder or double-apply a quick-reply.
 */

import { DatabaseError } from "../errors.js";
import { BaseRepository } from "./base.repository.js";
import { isBlockingAppointmentRow } from "../lib/appointment-availability.js";
import { APPOINTMENT_STATUS, CONFIRMED_AUTO_COMPLETE_GRACE_MINUTES } from "../constants.js";

const NO_DOUBLE_BOOKING_CONSTRAINT = "appointments_no_double_booking";
const WA_MESSAGE_ID_CONSTRAINT = "appointments_wa_message_id_key";
const UNIQUE_VIOLATION_CODE = "23505";
const NOT_FOUND_CODE = "PGRST116";
const EXPIRED_HOLD_CANCELLATION_REASON = "hold_expired";
const PAYMENT_FAILED_CANCELLATION_REASON = "payment_failed";
const PATIENT_CANCELLED_VIA_REMINDER_REASON = "patient_cancelled_via_reminder";
const DASHBOARD_CANCELLED_REASON = "cancelled_by_doctor";
const PATIENT_REQUESTED_CANCELLATION_REASON = "patient_requested";

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
   * Clinic-scoped appointment list shared by the dashboard and Appointments
   * page. Optional ISO bounds use a half-open [from, to) interval.
   * Pagination is internal so PostgREST's row cap cannot truncate "All".
   *
   * @param {string} clinicId
   * @param {{ fromIso?: string; toIso?: string; ascending?: boolean }} [filters]
   * @returns {Promise<Array<{ id: string; patient_id: string; contact_phone: string; slot_start: string; slot_end: string; status: string; payment_status: string|null; payment_amount: number|null; created_at: string; patients: { full_name: string }|null }>>}
   */
  async findForClinic(clinicId, { fromIso, toIso, ascending = true } = {}) {
    const PAGE_SIZE = 500;
    const all = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const rows = await this._run(
        () => {
          let query = this._db
            .from(this._table)
            .select("id, patient_id, contact_phone, slot_start, slot_end, status, payment_status, payment_amount, created_at, patients(full_name)")
            .eq("clinic_id", clinicId)
            .is("deleted_at", null);

          if (fromIso) query = query.gte("slot_start", fromIso);
          if (toIso) query = query.lt("slot_start", toIso);
          return query
            .order("slot_start", { ascending })
            .range(from, to);
        },
        "findForClinic",
      );

      all.push(...rows);
      hasMore = rows.length === PAGE_SIZE;
      page += 1;
    }

    return all;
  }

  async findDashboardActivity(clinicId, fromIso, toIso) {
    return this.findForClinic(clinicId, { fromIso, toIso, ascending: true });
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
   * Lookup by appointment id alone (admin/cron force-send paths that already
   * know the appointment UUID). Still excludes soft-deleted rows.
   *
   * @param {string} appointmentId
   * @returns {Promise<object|null>}
   */
  async findById(appointmentId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select("*")
          .eq("id", appointmentId)
          .is("deleted_at", null)
          .single(),
      "findById",
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

  /**
   * Doctor-initiated cancellation from the authenticated dashboard.
   * Completed, no-show, already-cancelled, and rescheduled rows are immutable.
   */
  async cancelFromDashboard(clinicId, appointmentId) {
    const nowIso = new Date().toISOString();
    const cancellableStatuses = [
      APPOINTMENT_STATUS.PENDING,
      APPOINTMENT_STATUS.PAYMENT_PENDING,
      APPOINTMENT_STATUS.CONFIRMED,
      APPOINTMENT_STATUS.RESCHEDULE_REQUESTED,
    ];
    const { data, error } = await this._db
      .from(this._table)
      .update({
        status: APPOINTMENT_STATUS.CANCELLED,
        cancellation_reason: DASHBOARD_CANCELLED_REASON,
        cancelled_at: nowIso,
        hold_expires_at: null,
        updated_at: nowIso,
      })
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .in("status", cancellableStatuses)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (!error) return data;
    if (error.code === NOT_FOUND_CODE) return null;
    throw new DatabaseError("cancelFromDashboard", error);
  }

  /**
   * Moves a doctor-managed appointment to a new slot. The database unique
   * index remains the source of truth for double-booking prevention.
   *
   * @returns {Promise<{ row: object|null; conflict: AppointmentInsertConflict|null }>}
   */
  async rescheduleFromDashboard(clinicId, appointmentId, slotStart, slotEnd) {
    const { data, error } = await this._db
      .from(this._table)
      .update({
        slot_start: slotStart,
        slot_end: slotEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .in("status", [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED])
      .is("deleted_at", null)
      .select("*")
      .single();

    if (!error) return { row: data, conflict: null };
    if (error.code === NOT_FOUND_CODE) return { row: null, conflict: null };
    if (error.code === UNIQUE_VIOLATION_CODE) {
      return { row: null, conflict: "SLOT_TAKEN" };
    }
    throw new DatabaseError("rescheduleFromDashboard", error);
  }

  // ─────────────────────────────────────────────────────────────
  // Session 5 — REMINDER_SENT (reminder cron + quick-reply handling)
  // ─────────────────────────────────────────────────────────────

  /**
   * CONFIRMED appointments for this clinic, within [fromIso, toIso), that
   * haven't had this particular reminder sent yet. Callers (ReminderService)
   * compute the window from the clinic's own reminder_Xh_offset_minutes —
   * this method is a pure parameterized read, no `now()`/offset logic here,
   * so it's trivially testable with fixed fake timestamps.
   *
   * @param {string} clinicId
   * @param {string} reminderSentAtColumn - "reminder_24h_sent_at" | "reminder_2h_sent_at"
   * @param {string} fromIso
   * @param {string} toIso
   * @returns {Promise<Array<object>>}
   */
  async findDueForReminder(clinicId, reminderSentAtColumn, fromIso, toIso) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .select("*")
          .eq("clinic_id", clinicId)
          .eq("status", APPOINTMENT_STATUS.CONFIRMED)
          .is("deleted_at", null)
          .is(reminderSentAtColumn, null)
          .gte("slot_start", fromIso)
          .lt("slot_start", toIso),
      "findDueForReminder",
    );
  }

  /**
   * Atomically claims one appointment for one reminder kind before sending
   * it — a single conditional UPDATE (never read-then-write), so two
   * overlapping cron runs (or a retried invocation) can never both send the
   * same reminder. Zero rows matched (returns null) means it was already
   * claimed elsewhere; the caller must skip sending, not treat it as an error.
   *
   * @param {string} clinicId
   * @param {string} appointmentId
   * @param {string} reminderSentAtColumn - "reminder_24h_sent_at" | "reminder_2h_sent_at"
   * @returns {Promise<object|null>}
   */
  async claimReminder(clinicId, appointmentId, reminderSentAtColumn) {
    const { data, error } = await this._db
      .from(this._table)
      .update({ [reminderSentAtColumn]: new Date().toISOString() })
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .eq("status", APPOINTMENT_STATUS.CONFIRMED)
      .is(reminderSentAtColumn, null)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (!error) return data;
    if (error.code === NOT_FOUND_CODE) return null;

    this._log.error("DB error during claimReminder", { appointmentId, reminderSentAtColumn, code: error.code });
    throw new DatabaseError("claimReminder", error);
  }

  /**
   * Bulk, idempotent no-response timeout (Session 5 step 5): any CONFIRMED
   * appointment whose slot ended more than CONFIRMED_AUTO_COMPLETE_GRACE_MINUTES
   * ago with no reply moves straight to COMPLETED. NO_SHOW tracking is
   * explicitly deferred per spec — this is COMPLETED-only, no clinic config
   * flag. A plain bulk UPDATE (not a per-row claim) is safe here because
   * re-running it is naturally a no-op: once a row is COMPLETED it no longer
   * matches `status = 'confirmed'`.
   *
   * @param {string} clinicId
   * @param {string} nowIso
   * @returns {Promise<Array<{ id: string }>>} rows that were transitioned, for logging.
   */
  async completeExpiredConfirmed(clinicId, nowIso) {
    const cutoffIso = new Date(
      Date.parse(nowIso) - CONFIRMED_AUTO_COMPLETE_GRACE_MINUTES * 60_000,
    ).toISOString();

    return this._run(
      () =>
        this._db
          .from(this._table)
          .update({ status: APPOINTMENT_STATUS.COMPLETED, updated_at: nowIso })
          .eq("clinic_id", clinicId)
          .eq("status", APPOINTMENT_STATUS.CONFIRMED)
          .is("deleted_at", null)
          .lt("slot_end", cutoffIso)
          .select("id"),
      "completeExpiredConfirmed",
    );
  }

  /**
   * Patient free-text "cancel" from the WhatsApp booking bot.
   * Cancels PAYMENT_PENDING (releases hold) or CONFIRMED rows. Idempotent:
   * replaying against a non-cancellable status returns null.
   *
   * @param {string} clinicId
   * @param {string} appointmentId
   * @returns {Promise<object|null>}
   */
  async cancelViaPatientKeyword(clinicId, appointmentId) {
    const nowIso = new Date().toISOString();
    const cancellableStatuses = [
      APPOINTMENT_STATUS.PAYMENT_PENDING,
      APPOINTMENT_STATUS.CONFIRMED,
    ];
    const { data, error } = await this._db
      .from(this._table)
      .update({
        status: APPOINTMENT_STATUS.CANCELLED,
        cancellation_reason: PATIENT_REQUESTED_CANCELLATION_REASON,
        cancelled_at: nowIso,
        hold_expires_at: null,
        updated_at: nowIso,
      })
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .in("status", cancellableStatuses)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (!error) return data;
    if (error.code === NOT_FOUND_CODE) return null;

    this._log.error("DB error during cancelViaPatientKeyword", { appointmentId, code: error.code });
    throw new DatabaseError("cancelViaPatientKeyword", error);
  }

  /**
   * "Cancel" quick-reply on a reminder. A single conditional UPDATE scoped
   * to `status = 'confirmed'` — replaying the same webhook (Meta redelivery)
   * naturally becomes a no-op the second time (zero rows matched), the same
   * pattern as releaseFailedHold above.
   *
   * @param {string} clinicId
   * @param {string} appointmentId
   * @returns {Promise<object|null>} the updated row, or null if it wasn't CONFIRMED.
   */
  async cancelViaReminderReply(clinicId, appointmentId) {
    const nowIso = new Date().toISOString();
    const { data, error } = await this._db
      .from(this._table)
      .update({
        status:              APPOINTMENT_STATUS.CANCELLED,
        cancellation_reason: PATIENT_CANCELLED_VIA_REMINDER_REASON,
        cancelled_at:        nowIso,
        hold_expires_at:     null,
        updated_at:          nowIso,
      })
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .eq("status", APPOINTMENT_STATUS.CONFIRMED)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (!error) return data;
    if (error.code === NOT_FOUND_CODE) return null;

    this._log.error("DB error during cancelViaReminderReply", { appointmentId, code: error.code });
    throw new DatabaseError("cancelViaReminderReply", error);
  }

  /**
   * Records Razorpay refund outcome on a cancelled appointment. Best-effort
   * side effect after cancelViaReminderReply — never used to gate cancellation.
   *
   * @param {string} clinicId
   * @param {string} appointmentId
   * @param {{
   *   refundStatus: string;
   *   refundId?: string|null;
   *   refundedAt?: string|null;
   *   paymentStatus?: string|null;
   * }} fields
   * @returns {Promise<object|null>}
   */
  async updateRefundFields(clinicId, appointmentId, {
    refundStatus,
    refundId = null,
    refundedAt = null,
    paymentStatus = null,
  }) {
    const nowIso = new Date().toISOString();
    const patch = {
      refund_status: refundStatus,
      updated_at: nowIso,
    };
    if (refundId != null) patch.refund_id = refundId;
    if (refundedAt != null) patch.refunded_at = refundedAt;
    if (paymentStatus != null) patch.payment_status = paymentStatus;

    const { data, error } = await this._db
      .from(this._table)
      .update(patch)
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (!error) return data;
    if (error.code === NOT_FOUND_CODE) return null;

    this._log.error("DB error during updateRefundFields", { appointmentId, code: error.code });
    throw new DatabaseError("updateRefundFields", error);
  }

  /**
   * Self-serve reschedule from a reminder: move a CONFIRMED appointment to a
   * new slot on the SAME row (does not insert a new appointment). Relies on
   * appointments_no_double_booking for the new slot. Zero rows / unique
   * violation → caller handles as stale / SLOT_TAKEN.
   *
   * @param {string} clinicId
   * @param {string} appointmentId
   * @param {string} slotStart ISO
   * @param {string} slotEnd ISO
   * @returns {Promise<{ row: object|null; conflict: AppointmentInsertConflict|null }>}
   */
  async rescheduleConfirmedSlot(clinicId, appointmentId, slotStart, slotEnd) {
    const nowIso = new Date().toISOString();
    const { data, error } = await this._db
      .from(this._table)
      .update({
        slot_start: slotStart,
        slot_end: slotEnd,
        hold_expires_at: null,
        updated_at: nowIso,
      })
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .eq("status", APPOINTMENT_STATUS.CONFIRMED)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (!error) return { row: data, conflict: null };
    if (error.code === NOT_FOUND_CODE) return { row: null, conflict: null };
    if (error.code === UNIQUE_VIOLATION_CODE) {
      return { row: null, conflict: "SLOT_TAKEN" };
    }
    throw new DatabaseError("rescheduleConfirmedSlot", error);
  }

  /**
   * "Reschedule" quick-reply on a reminder — legacy manual-follow-up path.
   * Prefer {@link rescheduleConfirmedSlot} + SlotSelectionService for
   * self-serve. Kept for callers/tests that still mark RESCHEDULE_REQUESTED.
   *
   * @param {string} clinicId
   * @param {string} appointmentId
   * @returns {Promise<object|null>} the updated row, or null if it wasn't CONFIRMED.
   */
  async requestRescheduleViaReminderReply(clinicId, appointmentId) {
    const nowIso = new Date().toISOString();
    const { data, error } = await this._db
      .from(this._table)
      .update({
        status:     APPOINTMENT_STATUS.RESCHEDULE_REQUESTED,
        updated_at: nowIso,
      })
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .eq("status", APPOINTMENT_STATUS.CONFIRMED)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (!error) return data;
    if (error.code === NOT_FOUND_CODE) return null;

    this._log.error("DB error during requestRescheduleViaReminderReply", { appointmentId, code: error.code });
    throw new DatabaseError("requestRescheduleViaReminderReply", error);
  }
}
