/**
 * @fileoverview InvoiceRepository — sequential invoice numbers + ledger
 * rows for booking consultation invoices (migration 024).
 */

import { BaseRepository } from "./base.repository.js";
import { DatabaseError } from "../errors.js";
import { formatInvoiceNumber } from "../lib/invoice-pdf.js";

/**
 * @typedef {{
 *   id: string;
 *   clinic_id: string;
 *   appointment_id: string;
 *   invoice_number: string;
 *   invoice_seq: number;
 *   razorpay_payment_id: string|null;
 *   storage_path: string;
 *   amount: number|null;
 *   created_at: string;
 * }} BookingInvoice
 */

export class InvoiceRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "booking_invoices");
  }

  /**
   * @param {string} clinicId
   * @param {string} appointmentId
   * @returns {Promise<BookingInvoice|null>}
   */
  async findByAppointment(clinicId, appointmentId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select(
            "id, clinic_id, appointment_id, invoice_number, invoice_seq, razorpay_payment_id, storage_path, amount, created_at",
          )
          .eq("clinic_id", clinicId)
          .eq("appointment_id", appointmentId)
          .single(),
      "findByAppointment",
    );
  }

  /**
   * Atomically allocates the next sequential invoice number for a clinic
   * via `next_booking_invoice_number` (migration 024).
   *
   * @param {string} clinicId
   * @returns {Promise<{ invoiceSeq: number; invoiceNumber: string }>}
   */
  async allocateNextNumber(clinicId) {
    const { data, error } = await this._db.rpc("next_booking_invoice_number", {
      p_clinic_id: clinicId,
    });
    if (error) {
      this._log.error("DB error during allocateNextNumber", {
        operation: "allocateNextNumber",
        table: "booking_invoice_counters",
        code: error.code,
      });
      throw new DatabaseError("allocateNextNumber", error);
    }
    const invoiceSeq = Number(data);
    return {
      invoiceSeq,
      invoiceNumber: formatInvoiceNumber(invoiceSeq),
    };
  }

  /**
   * @param {{
   *   clinicId: string;
   *   appointmentId: string;
   *   invoiceNumber: string;
   *   invoiceSeq: number;
   *   razorpayPaymentId?: string|null;
   *   storagePath: string;
   *   amount?: number|null;
   * }} params
   * @returns {Promise<BookingInvoice>}
   */
  async insert({
    clinicId,
    appointmentId,
    invoiceNumber,
    invoiceSeq,
    razorpayPaymentId = null,
    storagePath,
    amount = null,
  }) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .insert({
            clinic_id: clinicId,
            appointment_id: appointmentId,
            invoice_number: invoiceNumber,
            invoice_seq: invoiceSeq,
            razorpay_payment_id: razorpayPaymentId,
            storage_path: storagePath,
            amount,
          })
          .select(
            "id, clinic_id, appointment_id, invoice_number, invoice_seq, razorpay_payment_id, storage_path, amount, created_at",
          )
          .single(),
      "insert",
    );
  }
}
