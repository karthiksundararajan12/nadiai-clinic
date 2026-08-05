/**
 * @fileoverview Hard-delete orchestration for clinic appointments.
 *
 * Cascade order:
 *   booking_invoices (+ Storage PDFs)
 *   → scribe_sessions (DB cascades clinical children)
 *   → appointment
 *
 * Refuses when payment_status is a captured Razorpay payment that has not
 * been refunded — doctor must Cancel (which refunds) first. No override.
 */

import { CAPTURED_PAYMENT_STATUSES } from "../booking/constants.js";
import { AppointmentRequestError } from "./appointments.service.js";

function hasUnrefundedCapturedPayment(appointment) {
  const status = String(appointment.payment_status ?? "").toLowerCase();
  return CAPTURED_PAYMENT_STATUSES.includes(status);
}

export class AppointmentDeleteService {
  /**
   * @param {{
   *   appointmentRepository: import("../booking/repository/appointment.repository.js").AppointmentRepository;
   *   invoiceRepository: import("../booking/repository/invoice.repository.js").InvoiceRepository;
   *   invoiceStorageService: import("../booking/services/invoice-storage.service.js").InvoiceStorageService;
   *   scribeSessionRepository: import("../scribe/repository/session.repository.js").SessionRepository;
   * }} deps
   */
  constructor({
    appointmentRepository,
    invoiceRepository,
    invoiceStorageService,
    scribeSessionRepository,
  }) {
    this._appointments = appointmentRepository;
    this._invoices = invoiceRepository;
    this._invoiceStorage = invoiceStorageService;
    this._scribeSessions = scribeSessionRepository;
  }

  /**
   * @param {string} clinicId
   * @param {string} appointmentId
   */
  async getDeletionImpact(clinicId, appointmentId) {
    const appointment = await this._appointments.findByIdForClinic(
      clinicId,
      appointmentId,
    );
    if (!appointment) {
      throw new AppointmentRequestError("Appointment not found", 404);
    }

    const invoices = await this._invoices.listByAppointmentIds(clinicId, [
      appointmentId,
    ]);
    const scribeSessions = await this._scribeSessions.countByAppointmentId(
      clinicId,
      appointmentId,
    );
    const blocked = hasUnrefundedCapturedPayment(appointment);

    return {
      appointmentId: appointment.id,
      status: appointment.status,
      paymentStatus: appointment.payment_status ?? null,
      bookingInvoices: invoices.length,
      scribeSessions,
      blocked,
      blockReason: blocked
        ? "This appointment has a captured payment that has not been refunded. Cancel the appointment first to issue a refund, then delete."
        : null,
    };
  }

  /**
   * @param {string} clinicId
   * @param {string} appointmentId
   */
  async hardDelete(clinicId, appointmentId) {
    const impact = await this.getDeletionImpact(clinicId, appointmentId);
    if (impact.blocked) {
      throw new AppointmentRequestError(
        impact.blockReason ??
          "Cancel this appointment first to refund the patient, then delete.",
        409,
      );
    }

    const invoices = await this._invoices.listByAppointmentIds(clinicId, [
      appointmentId,
    ]);
    const storagePaths = invoices.map((row) => row.storage_path).filter(Boolean);
    await this._invoiceStorage.deleteInvoicePdfs(storagePaths);
    const deletedBookingInvoices = await this._invoices.deleteByAppointmentIds(
      clinicId,
      [appointmentId],
    );

    const deletedScribeSessions =
      await this._scribeSessions.hardDeleteByAppointmentId(
        clinicId,
        appointmentId,
      );

    const deleted = await this._appointments.hardDeleteById(
      clinicId,
      appointmentId,
    );
    if (!deleted) {
      throw new AppointmentRequestError("Appointment not found", 404);
    }

    return {
      deleted: true,
      appointmentId,
      deletedBookingInvoices,
      deletedScribeSessions,
    };
  }
}
