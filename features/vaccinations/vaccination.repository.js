/**
 * @fileoverview VaccinationRepository — data access for
 * public.vaccination_schedules (migration 030). Reuses booking's
 * BaseRepository/DatabaseError/escapeIlikePattern the same way
 * features/appointments and features/patients reach into
 * features/booking's internals directly (see those files) rather than only
 * the barrel export — that convention is reserved for API routes/pages.
 */

import { BaseRepository } from "../booking/repository/base.repository.js";
import { DatabaseError } from "../booking/errors.js";
import { escapeIlikePattern } from "../booking/lib/payment-list.js";
import { VACCINATION_STATUS } from "./constants.js";

const NOT_FOUND_CODE = "PGRST116";

/**
 * @typedef {{
 *   id: string;
 *   patient_id: string;
 *   patient_name: string;
 *   patient_date_of_birth_is_approximate: boolean;
 *   vaccine_name: string;
 *   due_date: string;
 *   status: string;
 *   reminder_sent_at: string|null;
 *   completed_at: string|null;
 *   created_at: string;
 * }} VaccinationListRow
 */

export class VaccinationRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "vaccination_schedules");
  }

  /**
   * @param {{ clinicId: string; patientId: string; vaccineName: string; dueDate: string }} data
   * @returns {Promise<object>}
   */
  async create({ clinicId, patientId, vaccineName, dueDate }) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .insert({
            clinic_id: clinicId,
            patient_id: patientId,
            vaccine_name: vaccineName,
            due_date: dueDate,
          })
          .select("*")
          .single(),
      "create",
    );
  }

  /**
   * Paginated vaccination-schedule rows for a clinic (dashboard table) —
   * same shape/approach as PaymentRepository.listForClinic.
   *
   * @param {string} clinicId
   * @param {{
   *   status?: string|null;
   *   fromDate?: string|null;
   *   toDate?: string|null;
   *   search?: string|null;
   *   limit?: number;
   *   offset?: number;
   * }} [filters]
   * @returns {Promise<{ rows: VaccinationListRow[]; total: number }>}
   */
  async listForClinic(clinicId, {
    status = null,
    fromDate = null,
    toDate = null,
    search = null,
    limit = 20,
    offset = 0,
  } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const q = typeof search === "string" ? search.trim() : "";

    /** @type {string[]|null} */
    let matchingPatientIds = null;
    if (q) {
      matchingPatientIds = await this._findPatientIdsByName(clinicId, q);
    }

    let query = this._db
      .from(this._table)
      .select(
        [
          "id",
          "patient_id",
          "vaccine_name",
          "due_date",
          "status",
          "reminder_sent_at",
          "completed_at",
          "created_at",
          "patients!inner(full_name, date_of_birth_is_approximate)",
        ].join(", "),
        { count: "exact" },
      )
      .eq("clinic_id", clinicId)
      .order("due_date", { ascending: true })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (status) {
      query = query.eq("status", status);
    }
    if (fromDate) {
      query = query.gte("due_date", fromDate);
    }
    if (toDate) {
      query = query.lte("due_date", toDate);
    }

    if (q) {
      const pattern = `%${escapeIlikePattern(q)}%`;
      if (matchingPatientIds && matchingPatientIds.length > 0) {
        query = query.or(
          `vaccine_name.ilike.${pattern},patient_id.in.(${matchingPatientIds.join(",")})`,
        );
      } else {
        query = query.ilike("vaccine_name", pattern);
      }
    }

    const { data, error, count } = await query;

    if (error) {
      this._log.error("DB error during listForClinic (vaccinations)", {
        operation: "listForClinic",
        table: this._table,
        code: error.code,
        details: error.details,
      });
      throw new DatabaseError("listVaccinationSchedules", error);
    }

    const rows = (data ?? []).map((row) => mapVaccinationRow(row));
    return { rows, total: count ?? rows.length };
  }

  /**
   * @param {string} clinicId
   * @param {string} search
   * @returns {Promise<string[]>}
   */
  async _findPatientIdsByName(clinicId, search) {
    const pattern = `%${escapeIlikePattern(search)}%`;
    const { data, error } = await this._db
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .ilike("full_name", pattern)
      .limit(200);

    if (error) {
      this._log.error("DB error during vaccination patient name search", {
        operation: "findPatientIdsByName",
        code: error.code,
      });
      throw new DatabaseError("listVaccinationSchedules", error);
    }
    return (data ?? []).map((row) => row.id);
  }

  /**
   * Full vaccination schedule for one patient (detail page), soonest due
   * date first — no pagination needed at per-patient scale.
   *
   * @param {string} clinicId
   * @param {string} patientId
   * @returns {Promise<object[]>}
   */
  async listForPatient(clinicId, patientId) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .select("id, patient_id, vaccine_name, due_date, status, reminder_sent_at, completed_at, created_at")
          .eq("clinic_id", clinicId)
          .eq("patient_id", patientId)
          .order("due_date", { ascending: true }),
      "listForPatient",
    );
  }

  /**
   * Bulk-inserts one row per entry, all status='pending' (DB default) —
   * used by VaccinationSeedingService (IAP auto-seed on patient creation,
   * and the one-time backfill script) to write a whole immunization
   * schedule in one request instead of one insert per dose.
   *
   * @param {Array<{ clinicId: string; patientId: string; vaccineName: string; dueDate: string }>} entries
   * @returns {Promise<object[]>}
   */
  async bulkCreate(entries) {
    if (!entries.length) return [];
    return this._run(
      () =>
        this._db
          .from(this._table)
          .insert(
            entries.map((e) => ({
              clinic_id: e.clinicId,
              patient_id: e.patientId,
              vaccine_name: e.vaccineName,
              due_date: e.dueDate,
            })),
          )
          .select("*"),
      "bulkCreate",
    );
  }

  /**
   * Whether this patient already has ANY vaccination_schedules row —
   * idempotency guard for VaccinationSeedingService and the backfill
   * script, regardless of whether the existing row(s) came from a prior
   * auto-seed, the backfill script, or a manual /vaccinations/new entry.
   *
   * @param {string} patientId
   * @returns {Promise<boolean>}
   */
  async existsForPatient(patientId) {
    const rows = await this._run(
      () =>
        this._db
          .from(this._table)
          .select("id")
          .eq("patient_id", patientId)
          .limit(1),
      "existsForPatient",
    );
    return rows.length > 0;
  }

  /**
   * Global (cross-clinic) lookup for the cron sweep — see
   * VaccinationReminderService.runReminderSweep. Paginated internally like
   * ClinicRepository.findAllWithWhatsAppConfigured. Unlike
   * ReminderService's per-clinic appointment loop, one global query is
   * sufficient here because the 3-day lead time is a fixed constant, not a
   * per-clinic config value.
   *
   * @param {string} cutoffDate YYYY-MM-DD — due_date <= this value
   * @returns {Promise<object[]>}
   */
  async findDueForReminder(cutoffDate) {
    const PAGE_SIZE = 500;
    const all = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const rows = await this._run(
        () =>
          this._db
            .from(this._table)
            .select("*")
            .eq("status", VACCINATION_STATUS.PENDING)
            .lte("due_date", cutoffDate)
            .order("id", { ascending: true })
            .range(from, to),
        "findDueForReminder",
      );
      all.push(...rows);
      hasMore = rows.length === PAGE_SIZE;
      page += 1;
    }
    return all;
  }

  /**
   * Atomically claims one schedule for reminder-send before sending it — a
   * single conditional UPDATE (never read-then-write), mirroring
   * AppointmentRepository.claimReminder so a redelivered/overlapping cron
   * run can never double-send. Zero rows matched (null) means it was
   * already claimed/sent/completed elsewhere.
   *
   * @param {string} scheduleId
   * @returns {Promise<object|null>}
   */
  async claimReminderSent(scheduleId) {
    const { data, error } = await this._db
      .from(this._table)
      .update({
        status: VACCINATION_STATUS.REMINDER_SENT,
        reminder_sent_at: new Date().toISOString(),
      })
      .eq("id", scheduleId)
      .eq("status", VACCINATION_STATUS.PENDING)
      .select("*")
      .single();

    if (!error) return data;
    if (error.code === NOT_FOUND_CODE) return null;

    this._log.error("DB error during claimReminderSent", {
      scheduleId,
      code: error.code,
    });
    throw new DatabaseError("claimReminderSent", error);
  }

  /**
   * Records a failed send attempt on an already-claimed (`reminder_sent`)
   * schedule (e.g. a real WhatsApp API error such as Meta 132001) and
   * decides whether it gets another chance:
   *
   *   - attempts (attemptsSoFar + 1) < maxAttempts: rolled back to
   *     `pending` (reminder_sent_at cleared) so it's picked up again on
   *     the next sweep — never left stuck as `reminder_sent` despite
   *     never being delivered.
   *   - attempts >= maxAttempts: moved to the terminal `reminder_failed`
   *     status instead — stops it from being retried forever against a
   *     permanent failure (unapproved template, dead number, etc.) and
   *     re-alerting on every single cron sweep.
   *
   * Either way this is a single atomic conditional UPDATE scoped to
   * `eq("status", "reminder_sent")` — same never-read-then-write pattern
   * as claimReminderSent, so a concurrent transition (e.g. marked
   * `completed` from the dashboard in the meantime) is never clobbered.
   * `attemptsSoFar` is read from the row already returned by
   * claimReminderSent (the caller's own claim), not re-fetched here, so
   * this stays a single write.
   *
   * @param {string} scheduleId
   * @param {number} attemptsSoFar `reminder_attempts` from the claimed row, before this failure
   * @param {number} maxAttempts
   * @returns {Promise<{ row: object|null; exhausted: boolean; attempts: number }>}
   */
  async recordReminderFailure(scheduleId, attemptsSoFar, maxAttempts) {
    const attempts = (attemptsSoFar ?? 0) + 1;
    const exhausted = attempts >= maxAttempts;

    const { data, error } = await this._db
      .from(this._table)
      .update(
        exhausted
          ? { status: VACCINATION_STATUS.REMINDER_FAILED, reminder_attempts: attempts }
          : { status: VACCINATION_STATUS.PENDING, reminder_sent_at: null, reminder_attempts: attempts },
      )
      .eq("id", scheduleId)
      .eq("status", VACCINATION_STATUS.REMINDER_SENT)
      .select("*")
      .single();

    if (!error) return { row: data, exhausted, attempts };
    if (error.code === NOT_FOUND_CODE) return { row: null, exhausted, attempts };

    this._log.error("DB error during recordReminderFailure", {
      scheduleId,
      code: error.code,
    });
    throw new DatabaseError("recordReminderFailure", error);
  }

  /**
   * Resets a stuck `reminder_sent` or `reminder_failed` schedule back to
   * `pending` with a clean attempt counter — used by the one-off
   * scripts/reset-vaccination-reminder-claim.mjs recovery script, never by
   * the cron sweep itself. Scoped to those two statuses so it's a no-op
   * (returns null) against a schedule that's already `pending`,
   * `completed`, or `overdue`.
   *
   * @param {string} scheduleId
   * @returns {Promise<object|null>}
   */
  async resetClaim(scheduleId) {
    const { data, error } = await this._db
      .from(this._table)
      .update({ status: VACCINATION_STATUS.PENDING, reminder_sent_at: null, reminder_attempts: 0 })
      .eq("id", scheduleId)
      .in("status", [VACCINATION_STATUS.REMINDER_SENT, VACCINATION_STATUS.REMINDER_FAILED])
      .select("*")
      .single();

    if (!error) return data;
    if (error.code === NOT_FOUND_CODE) return null;

    this._log.error("DB error during resetClaim", {
      scheduleId,
      code: error.code,
    });
    throw new DatabaseError("resetClaim", error);
  }

  /**
   * Bulk, idempotent overdue sweep: any `reminder_sent` schedule whose
   * due_date has passed moves to `overdue`. Safe to re-run — once a row is
   * `overdue` it no longer matches status = 'reminder_sent'.
   *
   * @param {string} todayDate YYYY-MM-DD
   * @returns {Promise<Array<{ id: string }>>}
   */
  async markOverdue(todayDate) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .update({ status: VACCINATION_STATUS.OVERDUE })
          .eq("status", VACCINATION_STATUS.REMINDER_SENT)
          .lt("due_date", todayDate)
          .select("id"),
      "markOverdue",
    );
  }

  /**
   * Unscoped lookup by id — used only by the CRON_SECRET-protected
   * force-send test endpoint (mirrors ReminderService.sendReminderNow's use
   * of AppointmentRepository.findById). Never expose without that auth.
   *
   * @param {string} scheduleId
   * @returns {Promise<object|null>}
   */
  async findById(scheduleId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select("*")
          .eq("id", scheduleId)
          .single(),
      "findById",
    );
  }
}

/**
 * @param {object} row
 * @returns {VaccinationListRow}
 */
function mapVaccinationRow(row) {
  const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients;
  return {
    id: row.id,
    patient_id: row.patient_id,
    patient_name: patient?.full_name ?? "Unknown patient",
    patient_date_of_birth_is_approximate: patient?.date_of_birth_is_approximate ?? false,
    vaccine_name: row.vaccine_name,
    due_date: row.due_date,
    status: row.status,
    reminder_sent_at: row.reminder_sent_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
  };
}
