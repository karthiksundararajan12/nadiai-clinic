/**
 * @fileoverview Hard-delete orchestration for clinic patients.
 *
 * Cascade order (app-level — booking_invoices RESTRICT blocks naive deletes):
 *   booking_invoices (+ Storage PDFs)
 *   → scribe_sessions (DB cascades clinical children)
 *   → appointments
 *   → patient (DB cascades vaccination_schedules + vitals)
 *
 * Refuses when any linked appointment still has a captured Razorpay payment
 * that has not been refunded — doctor must Cancel (refund) those first.
 */

import { CAPTURED_PAYMENT_STATUSES } from "../booking/constants.js";
import { PatientRequestError } from "./patients.service.js";

function hasUnrefundedCapturedPayment(appointment) {
  const status = String(appointment.payment_status ?? "").toLowerCase();
  return CAPTURED_PAYMENT_STATUSES.includes(status);
}

export class PatientDeleteService {
  /**
   * @param {{
   *   patientRepository: import("../booking/repository/patient.repository.js").PatientRepository;
   *   appointmentRepository: import("../booking/repository/appointment.repository.js").AppointmentRepository;
   *   invoiceRepository: import("../booking/repository/invoice.repository.js").InvoiceRepository;
   *   invoiceStorageService: import("../booking/services/invoice-storage.service.js").InvoiceStorageService;
   *   scribeSessionRepository: import("../scribe/repository/session.repository.js").SessionRepository;
   *   vaccinationRepository: import("../vaccinations/vaccination.repository.js").VaccinationRepository;
   *   vitalsRepository: import("../vitals/vitals.repository.js").VitalsRepository;
   * }} deps
   */
  constructor({
    patientRepository,
    appointmentRepository,
    invoiceRepository,
    invoiceStorageService,
    scribeSessionRepository,
    vaccinationRepository,
    vitalsRepository,
  }) {
    this._patients = patientRepository;
    this._appointments = appointmentRepository;
    this._invoices = invoiceRepository;
    this._invoiceStorage = invoiceStorageService;
    this._scribeSessions = scribeSessionRepository;
    this._vaccinations = vaccinationRepository;
    this._vitals = vitalsRepository;
  }

  /**
   * @param {string} clinicId
   * @param {string} patientId
   */
  async getDeletionImpact(clinicId, patientId) {
    const patient = await this._patients.findById(clinicId, patientId);
    if (!patient) {
      throw new PatientRequestError("Patient not found", 404);
    }

    const appointments = await this._appointments.findForPatient(clinicId, patientId);
    const appointmentIds = appointments.map((a) => a.id);
    const invoices = await this._invoices.listByAppointmentIds(clinicId, appointmentIds);
    const [
      scribeSessions,
      vaccinationSchedules,
      vitals,
    ] = await Promise.all([
      this._scribeSessions.countByPatientId(clinicId, patientId),
      this._vaccinations.countForPatient(clinicId, patientId),
      this._vitals.countForPatient(clinicId, patientId),
    ]);

    const paidUnrefundedCount = appointments.filter(hasUnrefundedCapturedPayment).length;

    return {
      patientId: patient.id,
      patientName: patient.full_name,
      appointments: appointments.length,
      bookingInvoices: invoices.length,
      scribeSessions,
      vaccinationSchedules,
      vitals,
      paidUnrefundedAppointments: paidUnrefundedCount,
      blocked: paidUnrefundedCount > 0,
    };
  }

  /**
   * @param {string} clinicId
   * @param {string} patientId
   */
  async hardDelete(clinicId, patientId) {
    const impact = await this.getDeletionImpact(clinicId, patientId);
    if (impact.blocked) {
      throw new PatientRequestError(
        "This patient has paid appointments that have not been refunded. Cancel those appointments first (to issue refunds), then delete the patient.",
        409,
      );
    }

    const appointments = await this._appointments.findForPatient(clinicId, patientId);
    const appointmentIds = appointments.map((a) => a.id);

    if (appointmentIds.length > 0) {
      const invoices = await this._invoices.listByAppointmentIds(clinicId, appointmentIds);
      const storagePaths = invoices.map((row) => row.storage_path).filter(Boolean);
      await this._invoiceStorage.deleteInvoicePdfs(storagePaths);
      await this._invoices.deleteByAppointmentIds(clinicId, appointmentIds);
    }

    const deletedScribeSessions =
      await this._scribeSessions.hardDeleteByPatientId(clinicId, patientId);

    const deletedAppointments =
      await this._appointments.hardDeleteByPatientId(clinicId, patientId);

    const deleted = await this._patients.hardDelete(clinicId, patientId);
    if (!deleted) {
      throw new PatientRequestError("Patient not found", 404);
    }

    return {
      deleted: true,
      patientId,
      deletedAppointments,
      deletedBookingInvoices: impact.bookingInvoices,
      deletedScribeSessions,
      deletedVaccinationSchedules: impact.vaccinationSchedules,
      deletedVitals: impact.vitals,
    };
  }
}
