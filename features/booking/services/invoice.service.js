/**
 * @fileoverview InvoiceService — generate + store + WhatsApp-send a
 * consultation invoice PDF after Razorpay payment.captured confirms an
 * appointment.
 *
 * Called from PaymentWebhookService as a best-effort side effect: failures
 * here must never roll back the appointment confirm or the existing
 * appt_booking_confirmed notification path.
 *
 * Flow:
 *   1. Idempotent: if a booking_invoices row already exists for the
 *      appointment, reuse its storage object and re-issue a signed URL.
 *   2. Else allocate the next sequential invoice number for clinic_id,
 *      generate the PDF (pdf-lib), upload to Supabase Storage, insert ledger.
 *   3. sendInvoiceDocument(...) — appt_invoice template + document PDF
 *      (gated by WHATSAPP_TEMPLATES_LIVE inside the send helper).
 */

import { createLogger } from "../logger.js";
import { formatSlotLabel } from "../lib/slot-engine.js";
import { sendInvoiceDocument } from "./invoice-whatsapp.js";
import { generateInvoicePdf } from "../lib/invoice-pdf.js";

export class InvoiceService {
  /**
   * @param {import("../repository/invoice.repository.js").InvoiceRepository} invoiceRepo
   * @param {import("./invoice-storage.service.js").InvoiceStorageService} invoiceStorage
   * @param {import("../repository/clinic.repository.js").ClinicRepository} clinicRepo
   * @param {import("../repository/patient.repository.js").PatientRepository} patientRepo
   * @param {import("../repository/doctor-profile.repository.js").DoctorProfileRepository} doctorProfileRepo
   * @param {{
   *   sendInvoiceDocument?: typeof sendInvoiceDocument;
   *   whatsappClient?: import("./whatsapp-client.service.js").WhatsAppClientService;
   *   templatesLive?: boolean;
   * }} [opts]
   */
  constructor(
    invoiceRepo,
    invoiceStorage,
    clinicRepo,
    patientRepo,
    doctorProfileRepo,
    {
      sendInvoiceDocument: sendFn = sendInvoiceDocument,
      whatsappClient = null,
      templatesLive = process.env.WHATSAPP_TEMPLATES_LIVE === "true",
    } = {},
  ) {
    this._invoiceRepo = invoiceRepo;
    this._storage = invoiceStorage;
    this._clinicRepo = clinicRepo;
    this._patientRepo = patientRepo;
    this._doctorRepo = doctorProfileRepo;
    this._sendInvoiceDocument = sendFn;
    this._wa = whatsappClient;
    this._templatesLive = templatesLive;
    this._log = createLogger({ component: "InvoiceService" });
  }

  /**
   * Generate (or reuse) the invoice PDF for a confirmed paid appointment,
   * upload to storage, and send via WhatsApp (`appt_invoice` + document).
   *
   * @param {{
   *   clinicId: string;
   *   appointment: {
   *     id: string;
   *     patient_id?: string|null;
   *     contact_phone: string;
   *     slot_start: string;
   *     payment_amount?: number|string|null;
   *     razorpay_payment_id?: string|null;
   *   };
   *   razorpayPaymentId: string;
   * }} params
   * @returns {Promise<{
   *   invoiceNumber: string;
   *   storagePath: string;
   *   pdfUrl: string;
   *   reused: boolean;
   * }|null>}
   */
  async deliverForConfirmedAppointment({ clinicId, appointment, razorpayPaymentId }) {
    const log = this._log.child({
      clinicId,
      appointmentId: appointment.id,
      razorpayPaymentId,
    });

    const clinic = await this._clinicRepo.findById(clinicId);
    if (!clinic) {
      log.warn("Cannot issue invoice — clinic not found");
      return null;
    }

    const existing = await this._invoiceRepo.findByAppointment(clinicId, appointment.id);
    let invoiceNumber;
    let storagePath;
    let pdfUrl;
    let reused = false;

    if (existing) {
      reused = true;
      invoiceNumber = existing.invoice_number;
      storagePath = existing.storage_path;
      pdfUrl = await this._storage.createSignedUrl(storagePath);
      log.info("Reusing existing booking invoice row (idempotent re-delivery)", {
        invoiceNumber,
        storagePath,
      });
    } else {
      const allocated = await this._invoiceRepo.allocateNextNumber(clinicId);
      invoiceNumber = allocated.invoiceNumber;

      const pdfBytes = await this._buildPdfBytes({
        clinic,
        appointment,
        razorpayPaymentId,
        invoiceNumber,
      });

      const uploaded = await this._storage.uploadInvoicePdf({
        clinicId,
        appointmentId: appointment.id,
        pdfBytes,
      });
      storagePath = uploaded.storagePath;
      pdfUrl = uploaded.pdfUrl;

      const amount =
        appointment.payment_amount == null || appointment.payment_amount === ""
          ? null
          : Number(appointment.payment_amount);

      await this._invoiceRepo.insert({
        clinicId,
        appointmentId: appointment.id,
        invoiceNumber,
        invoiceSeq: allocated.invoiceSeq,
        razorpayPaymentId,
        storagePath,
        amount: amount != null && Number.isFinite(amount) ? amount : null,
      });

      log.info("Generated and stored consultation invoice PDF", {
        invoiceNumber,
        storagePath,
      });
    }

    if (clinic.whatsapp_phone_number_id && appointment.contact_phone) {
      const bodyParams = [formatSlotLabel(new Date(appointment.slot_start))];
      await this._sendInvoiceDocument(
        clinic.whatsapp_phone_number_id,
        appointment.contact_phone,
        pdfUrl,
        {
          whatsappClient: this._wa,
          bodyParams,
          filename: `${invoiceNumber}.pdf`,
          templatesLive: this._templatesLive,
        },
      );
    } else {
      log.warn("Skipping invoice WhatsApp send — missing phone_number_id or contact phone", {
        hasPhoneNumberId: Boolean(clinic.whatsapp_phone_number_id),
        hasContactPhone: Boolean(appointment.contact_phone),
      });
    }

    return { invoiceNumber, storagePath, pdfUrl, reused };
  }

  async _buildPdfBytes({ clinic, appointment, razorpayPaymentId, invoiceNumber }) {
    const [patient, doctor] = await Promise.all([
      appointment.patient_id
        ? this._patientRepo.findById(clinic.id, appointment.patient_id)
        : null,
      this._doctorRepo.findPrimaryByClinicId(clinic.id),
    ]);

    return generateInvoicePdf({
      clinicName: clinic.name,
      clinicAddress: clinic.address,
      clinicPhone: clinic.phone ?? null,
      clinicLogoUrl: clinic.logo_url ?? clinic.logoUrl ?? null,
      doctorName: doctor?.full_name ?? "NA",
      patientName: patient?.full_name ?? "NA",
      patientPhone: appointment.contact_phone ?? null,
      appointmentId: appointment.id ?? null,
      slotStart: appointment.slot_start,
      consultationAmount: appointment.payment_amount,
      razorpayPaymentId,
      invoiceNumber,
    });
  }
}
