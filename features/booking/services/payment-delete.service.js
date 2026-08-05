/**
 * @fileoverview "Delete payment" for the dashboard ledger (P1).
 *
 * There is no dedicated payments table — payment accounting lives on
 * appointments.payment_* / refund_* plus an optional booking_invoices row.
 * Delete clears those fields, removes the invoice ledger row + Storage PDF,
 * and keeps the appointment itself.
 */

import { PaymentRequestError } from "./payments.service.js";

export class PaymentDeleteService {
  /**
   * @param {{
   *   appointmentRepository: import("../repository/appointment.repository.js").AppointmentRepository;
   *   invoiceRepository: import("../repository/invoice.repository.js").InvoiceRepository;
   *   invoiceStorageService: import("./invoice-storage.service.js").InvoiceStorageService;
   * }} deps
   */
  constructor({
    appointmentRepository,
    invoiceRepository,
    invoiceStorageService,
  }) {
    this._appointments = appointmentRepository;
    this._invoices = invoiceRepository;
    this._invoiceStorage = invoiceStorageService;
  }

  /**
   * @param {string} clinicId
   * @param {string} appointmentId
   */
  async deletePaymentRecord(clinicId, appointmentId) {
    const appointment = await this._appointments.findByIdForClinic(
      clinicId,
      appointmentId,
    );
    if (!appointment) {
      throw new PaymentRequestError("Payment not found", 404);
    }

    const paymentStatus = String(appointment.payment_status ?? "").toLowerCase();
    if (!paymentStatus || paymentStatus === "not_required") {
      throw new PaymentRequestError("Payment not found", 404);
    }

    const invoices = await this._invoices.listByAppointmentIds(clinicId, [
      appointmentId,
    ]);
    const storagePaths = invoices.map((row) => row.storage_path).filter(Boolean);
    await this._invoiceStorage.deleteInvoicePdfs(storagePaths);
    const deletedInvoices = await this._invoices.deleteByAppointmentIds(
      clinicId,
      [appointmentId],
    );

    const cleared = await this._appointments.clearPaymentFields(
      clinicId,
      appointmentId,
    );
    if (!cleared) {
      throw new PaymentRequestError("Payment not found", 404);
    }

    return {
      deleted: true,
      appointmentId,
      deletedBookingInvoices: deletedInvoices,
      clearedPaymentFields: true,
    };
  }
}
