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
          "patients!inner(full_name)",
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
    vaccine_name: row.vaccine_name,
    due_date: row.due_date,
    status: row.status,
    reminder_sent_at: row.reminder_sent_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
  };
}
