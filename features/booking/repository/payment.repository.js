/**
 * @fileoverview PaymentRepository — clinic payment ledger from appointments
 * (source of truth) left-joined to booking_invoices. There is no dedicated
 * payments table; Razorpay confirm/fail writes payment_* columns on appointments.
 */

import { BaseRepository } from "./base.repository.js";
import { DatabaseError } from "../errors.js";
import {
  escapeIlikePattern,
  paymentStatusFilterToDb,
} from "../lib/payment-list.js";

/**
 * @typedef {{
 *   id: string;
 *   appointment_id: string;
 *   patient_id: string;
 *   patient_name: string;
 *   slot_start: string;
 *   slot_end: string|null;
 *   amount: number|null;
 *   payment_status: string|null;
 *   razorpay_payment_id: string|null;
 *   invoice_number: string|null;
 *   invoice_storage_path: string|null;
 *   created_at: string;
 * }} PaymentListRow
 */

export class PaymentRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "appointments");
  }

  /**
   * Paginated payment rows for a clinic.
   *
   * @param {string} clinicId
   * @param {{
   *   search?: string|null;
   *   status?: string|null;
   *   fromIso?: string|null;
   *   toIso?: string|null;
   *   limit?: number;
   *   offset?: number;
   * }} [filters]
   * @returns {Promise<{ rows: PaymentListRow[]; total: number }>}
   */
  async listForClinic(clinicId, {
    search = null,
    status = null,
    fromIso = null,
    toIso = null,
    limit = 20,
    offset = 0,
  } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const dbStatus = paymentStatusFilterToDb(status);
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
          "slot_start",
          "slot_end",
          "payment_amount",
          "payment_status",
          "razorpay_payment_id",
          "created_at",
          "patients!inner(full_name)",
          "booking_invoices(invoice_number, storage_path)",
        ].join(", "),
        { count: "exact" },
      )
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .neq("payment_status", "not_required")
      .order("created_at", { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (dbStatus) {
      query = query.eq("payment_status", dbStatus);
    }

    if (fromIso) {
      query = query.gte("created_at", fromIso);
    }
    if (toIso) {
      query = query.lte("created_at", toIso);
    }

    if (q) {
      const pattern = `%${escapeIlikePattern(q)}%`;
      if (matchingPatientIds && matchingPatientIds.length > 0) {
        // PostgREST: or(payment_id ilike, patient_id in (...))
        query = query.or(
          `razorpay_payment_id.ilike.${pattern},patient_id.in.(${matchingPatientIds.join(",")})`,
        );
      } else {
        query = query.ilike("razorpay_payment_id", pattern);
      }
    }

    const { data, error, count } = await query;

    if (error) {
      this._log.error("DB error during listForClinic (payments)", {
        operation: "listForClinic",
        table: this._table,
        code: error.code,
        details: error.details,
      });
      throw new DatabaseError("listPayments", error);
    }

    const rows = (data ?? []).map((row) => mapPaymentRow(row));
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
      this._log.error("DB error during payment patient name search", {
        operation: "findPatientIdsByName",
        code: error.code,
      });
      throw new DatabaseError("listPayments", error);
    }
    return (data ?? []).map((row) => row.id);
  }
}

/**
 * @param {object} row
 * @returns {PaymentListRow}
 */
function mapPaymentRow(row) {
  const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients;
  const invoice = Array.isArray(row.booking_invoices)
    ? row.booking_invoices[0]
    : row.booking_invoices;

  return {
    id: row.id,
    appointment_id: row.id,
    patient_id: row.patient_id,
    patient_name: patient?.full_name ?? "Unknown patient",
    slot_start: row.slot_start,
    slot_end: row.slot_end ?? null,
    amount: row.payment_amount != null ? Number(row.payment_amount) : null,
    payment_status: row.payment_status ?? null,
    razorpay_payment_id: row.razorpay_payment_id ?? null,
    invoice_number: invoice?.invoice_number ?? null,
    invoice_storage_path: invoice?.storage_path ?? null,
    created_at: row.created_at,
  };
}
