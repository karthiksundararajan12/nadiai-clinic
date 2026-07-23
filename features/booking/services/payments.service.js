/**
 * @fileoverview PaymentsService — clinic payment ledger for the dashboard.
 */

import {
  formatPaymentStatusLabel,
  resolvePaymentDateRange,
} from "../lib/payment-list.js";
import { formatSlotLabel } from "../lib/slot-engine.js";

export class PaymentsService {
  /**
   * @param {import("../repository/payment.repository.js").PaymentRepository} paymentRepo
   */
  constructor(paymentRepo) {
    this._paymentRepo = paymentRepo;
  }

  /**
   * @param {string} clinicId
   * @param {{
   *   search?: string|null;
   *   status?: string|null;
   *   range?: string|null;
   *   from?: string|null;
   *   to?: string|null;
   *   limit?: number;
   *   offset?: number;
   * }} [filters]
   */
  async list(clinicId, {
    search = null,
    status = null,
    range = "all",
    from = null,
    to = null,
    limit = 20,
    offset = 0,
  } = {}) {
    const { fromIso, toIso } = resolvePaymentDateRange(range, { from, to });
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const { rows, total } = await this._paymentRepo.listForClinic(clinicId, {
      search,
      status,
      fromIso,
      toIso,
      limit: safeLimit,
      offset: safeOffset,
    });

    const payments = rows.map((row) => ({
      id: row.id,
      appointmentId: row.appointment_id,
      patientId: row.patient_id,
      patientName: row.patient_name,
      slotStart: row.slot_start,
      slotLabel: row.slot_start ? formatSlotLabel(new Date(row.slot_start)) : null,
      amount: row.amount,
      paymentStatus: row.payment_status,
      paymentStatusLabel: formatPaymentStatusLabel(row.payment_status),
      razorpayPaymentId: row.razorpay_payment_id,
      invoiceNumber: row.invoice_number,
      hasInvoicePdf: Boolean(row.invoice_storage_path),
      createdAt: row.created_at,
    }));

    return {
      payments,
      total,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + payments.length < total,
    };
  }
}
