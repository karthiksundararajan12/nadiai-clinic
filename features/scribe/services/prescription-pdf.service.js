/**
 * @fileoverview PrescriptionPdfService — generate + store + WhatsApp-send an
 * approved prescription PDF after PrescriptionReviewService.approve succeeds.
 *
 * Best-effort side effect: failures here must never roll back approval.
 *
 * Flow:
 *   1. Idempotent: if the draft already has prescription_number +
 *      pdf_storage_path, reuse (re-sign URL).
 *   2. Else allocate next RX-###### for clinic_id, generate PDF, upload
 *      via service-role storage, persist number + path on the draft.
 *   3. sendPrescriptionDocument(...) — appt_prescription template + document
 *      PDF (gated by WHATSAPP_TEMPLATES_LIVE). Session-window warn + alertOps
 *      on send failure (mirror finalizeAfterCancel visibility).
 */

import { createLogger } from "../logger.js";
import { generatePrescriptionPdf } from "../lib/prescription-pdf.js";
import { getDoctorRegistrationNumber } from "../lib/prescription-registration-gate.js";
import { sendPrescriptionDocument } from "./prescription-whatsapp.js";
import { formatSlotLabel } from "../../booking/lib/slot-engine.js";
import { maskPhoneForLog } from "../../booking/lib/phone.js";
import { isConversationExpired } from "../../booking/lib/conversation-expiry.js";
import { alertOps, OPS_ALERT_STEP } from "../../booking/lib/alerting.js";

/** Meta Cloud API: re-engagement / outside 24h customer-service window. */
const META_SESSION_WINDOW_ERROR_CODE = 131047;

/**
 * @param {unknown} err
 * @returns {{ metaErrorCode: number|string|null; metaErrorMessage: string; metaErrorType: string|null }}
 */
function extractMetaSendError(err) {
  const details = err && typeof err === "object" ? err.details : null;
  const meta = details && typeof details === "object" ? details : null;
  return {
    metaErrorCode: meta?.code ?? null,
    metaErrorMessage:
      (typeof meta?.message === "string" && meta.message) ||
      (err instanceof Error ? err.message : String(err)),
    metaErrorType: typeof meta?.type === "string" ? meta.type : null,
  };
}

export class PrescriptionPdfService {
  /**
   * @param {import("../repository/prescription.repository.js").PrescriptionRepository} prescriptionRepo
   * @param {import("./prescription-storage.service.js").PrescriptionStorageService} storage
   * @param {{
   *   sendPrescriptionDocument?: typeof sendPrescriptionDocument;
   *   whatsappClient?: import("../../booking/services/whatsapp-client.service.js").WhatsAppClientService|null;
   *   conversationStateRepository?: import("../../booking/repository/conversation-state.repository.js").ConversationStateRepository|null;
   *   clinicRepository?: { findById: (id: string) => Promise<{ id: string; whatsapp_phone_number_id?: string|null; phone?: string|null; name?: string; address?: string|null }|null> }|null;
   *   appointmentRepository?: { findByIdForClinic: (clinicId: string, appointmentId: string) => Promise<{ id: string; contact_phone?: string|null; slot_start?: string|null; patient_id?: string|null }|null> }|null;
   *   templatesLive?: boolean;
   * }} [opts]
   */
  constructor(prescriptionRepo, storage, {
    sendPrescriptionDocument: sendFn = sendPrescriptionDocument,
    whatsappClient = null,
    conversationStateRepository = null,
    clinicRepository = null,
    appointmentRepository = null,
    templatesLive = process.env.WHATSAPP_TEMPLATES_LIVE === "true",
  } = {}) {
    this._prescriptions = prescriptionRepo;
    this._storage = storage;
    this._sendPrescriptionDocument = sendFn;
    this._wa = whatsappClient;
    this._conversationStateRepo = conversationStateRepository;
    this._clinicRepo = clinicRepository;
    this._appointmentRepo = appointmentRepository;
    this._templatesLive = templatesLive;
    this._log = createLogger({ component: "PrescriptionPdfService" });
  }

  /**
   * @param {{
   *   session: Record<string, unknown>;
   *   draft: Record<string, unknown>;
   *   ctx: { clinicId: string; doctorId: string; actorId?: string };
   * }} params
   * @returns {Promise<{
   *   prescriptionNumber: string;
   *   storagePath: string;
   *   pdfUrl: string;
   *   reused: boolean;
   *   whatsapp?: Record<string, unknown>|null;
   * }|null>}
   */
  async deliverForApprovedDraft({ session, draft, ctx }) {
    const log = this._log.child({
      clinicId: ctx.clinicId,
      sessionId: session.id,
      draftId: draft.id,
    });

    try {
      const appointmentId =
        (typeof draft.appointment_id === "string" && draft.appointment_id) ||
        (typeof session.appointment_id === "string" && session.appointment_id) ||
        null;

      if (!appointmentId) {
        log.warn("Skipping prescription PDF — no appointment_id on session/draft");
        return null;
      }

      let prescriptionNumber;
      let storagePath;
      let pdfUrl;
      let reused = false;

      if (draft.prescription_number && draft.pdf_storage_path) {
        reused = true;
        prescriptionNumber = draft.prescription_number;
        storagePath = draft.pdf_storage_path;
        pdfUrl = await this._storage.createSignedUrl(storagePath);
        log.info("Reusing existing prescription PDF (idempotent)", {
          prescriptionNumber,
          storagePath,
        });
      } else {
        const allocated = await this._prescriptions.allocateNextNumber(ctx.clinicId);
        prescriptionNumber = allocated.prescriptionNumber;

        const context = await this._prescriptions.getGenerationContext(session.id);
        const doctor =
          context?.doctor ?? (await this._prescriptions.getDoctorProfile(ctx.doctorId));
        const patient = context?.patient ?? null;
        const appointment = context?.appointment ?? null;

        const consultationDate =
          appointment?.slot_start ??
          appointment?.date ??
          session.created_at ??
          draft.approved_at ??
          new Date().toISOString();

        const clinicPhone =
          (await this._prescriptions.getClinicPhone(ctx.clinicId)) ??
          doctor?.phone ??
          null;

        const pdfBytes = await generatePrescriptionPdf({
          clinicName: doctor?.clinic_name ?? "Clinic",
          clinicAddress: doctor?.clinic_address ?? null,
          clinicPhone,
          doctorName: doctor?.full_name ?? "NA",
          specialization: doctor?.specialization ?? null,
          registrationNumber: getDoctorRegistrationNumber(doctor),
          patientName: patient?.name ?? "NA",
          patientAge: patient?.age ?? null,
          patientDob: patient?.date_of_birth ?? null,
          consultationDate,
          prescriptionNumber,
          draft: draft.draft ?? {},
        });

        const uploaded = await this._storage.uploadPrescriptionPdf({
          clinicId: ctx.clinicId,
          appointmentId,
          pdfBytes,
        });
        storagePath = uploaded.storagePath;
        pdfUrl = uploaded.pdfUrl;

        await this._prescriptions.updateDraftFields(draft.id, {
          prescription_number: allocated.prescriptionNumber,
          prescription_seq: allocated.prescriptionSeq,
          pdf_storage_path: uploaded.storagePath,
        });

        log.info("Generated and stored prescription PDF", {
          prescriptionNumber,
          storagePath,
        });
      }

      const whatsapp = await this._sendWhatsAppDocument({
        clinicId: ctx.clinicId,
        appointmentId,
        prescriptionNumber,
        pdfUrl,
        session,
        log,
      });

      return {
        prescriptionNumber,
        storagePath,
        pdfUrl,
        reused,
        whatsapp,
      };
    } catch (err) {
      log.error("Failed to generate/store prescription PDF (approval unaffected)", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Best-effort WhatsApp send. Never throws.
   * @param {{
   *   clinicId: string;
   *   appointmentId: string;
   *   prescriptionNumber: string;
   *   pdfUrl: string;
   *   session: Record<string, unknown>;
   *   log: import("../logger.js").Logger;
   * }} params
   */
  async _sendWhatsAppDocument({
    clinicId,
    appointmentId,
    prescriptionNumber,
    pdfUrl,
    session,
    log,
  }) {
    try {
      const clinic = this._clinicRepo
        ? await this._clinicRepo.findById(clinicId)
        : null;
      const appointment = this._appointmentRepo
        ? await this._appointmentRepo.findByIdForClinic(clinicId, appointmentId)
        : null;

      const phoneNumberId = clinic?.whatsapp_phone_number_id ?? null;
      const contactPhone = appointment?.contact_phone ?? null;
      const slotStart =
        appointment?.slot_start ??
        session.created_at ??
        new Date().toISOString();

      if (!phoneNumberId || !contactPhone) {
        log.warn("Skipping prescription WhatsApp send — missing phone_number_id or contact phone", {
          appointmentId,
          hasPhoneNumberId: Boolean(phoneNumberId),
          hasContactPhone: Boolean(contactPhone),
        });
        return { skipped: true, reason: "missing_phone" };
      }

      const maskedPhone = maskPhoneForLog(contactPhone);
      log.info("Sending patient prescription WhatsApp document", {
        appointmentId,
        patientPhoneMasked: maskedPhone,
        prescriptionNumber,
        templatesLive: this._templatesLive,
      });

      const outsideSessionWindow = await this._isOutsideWhatsAppSessionWindow({
        clinicId,
        contactPhone,
        log,
      });
      if (outsideSessionWindow) {
        log.warn(
          "Prescription WhatsApp send: 24h session window appears closed — free-form document may fail (Meta 131047); template path still attempted when live",
          {
            appointmentId,
            patientPhoneMasked: maskedPhone,
            lastMessageAt: outsideSessionWindow.lastMessageAt,
          },
        );
      }

      try {
        const bodyParams = [formatSlotLabel(new Date(slotStart))];
        const result = await this._sendPrescriptionDocument(
          phoneNumberId,
          contactPhone,
          pdfUrl,
          {
            whatsappClient: this._wa,
            bodyParams,
            filename: `${prescriptionNumber}.pdf`,
            templatesLive: this._templatesLive,
          },
        );

        log.info("Patient prescription WhatsApp send finished", {
          appointmentId,
          patientPhoneMasked: maskedPhone,
          success: true,
          stubbed: Boolean(result?.stubbed),
          templateName: result?.templateName ?? null,
        });
        return result;
      } catch (err) {
        const { metaErrorCode, metaErrorMessage, metaErrorType } =
          extractMetaSendError(err);
        const isSessionWindowError =
          Number(metaErrorCode) === META_SESSION_WINDOW_ERROR_CODE ||
          Boolean(outsideSessionWindow);

        log.error("Patient prescription WhatsApp send failed", {
          appointmentId,
          patientPhoneMasked: maskedPhone,
          success: false,
          metaErrorCode,
          metaErrorMessage,
          metaErrorType,
          sessionWindowClosed: Boolean(isSessionWindowError),
          lastMessageAt: outsideSessionWindow?.lastMessageAt ?? null,
          error: err instanceof Error ? err.message : String(err),
          errorDetails: err?.details ?? null,
        });

        await alertOps({
          title: isSessionWindowError
            ? "Prescription WhatsApp send failed — outside 24h session window"
            : "Failed to send prescription WhatsApp document after approval",
          step: OPS_ALERT_STEP.WHATSAPP_SEND,
          error: err,
          clinicId,
          patientId: appointment?.patient_id ?? null,
          contactPhone: maskedPhone,
          extra: {
            appointment_id: appointmentId,
            prescription_number: prescriptionNumber,
            metaErrorCode: metaErrorCode ?? null,
            metaErrorMessage,
            sessionWindowClosed: Boolean(isSessionWindowError),
          },
        });

        return {
          failed: true,
          sessionWindowClosed: Boolean(isSessionWindowError),
          metaErrorCode,
        };
      }
    } catch (err) {
      log.error("Prescription WhatsApp send setup failed (approval/PDF unaffected)", {
        appointmentId,
        error: err instanceof Error ? err.message : String(err),
      });
      await alertOps({
        title: "Prescription WhatsApp send setup failed after approval",
        step: OPS_ALERT_STEP.WHATSAPP_SEND,
        error: err,
        clinicId,
        extra: { appointment_id: appointmentId, prescription_number: prescriptionNumber },
      });
      return { failed: true };
    }
  }

  /**
   * @param {{ clinicId: string; contactPhone: string; log: import("../logger.js").Logger }} params
   * @returns {Promise<{ lastMessageAt: string|null }|null>}
   */
  async _isOutsideWhatsAppSessionWindow({ clinicId, contactPhone, log }) {
    if (!this._conversationStateRepo?.find) return null;
    try {
      const row = await this._conversationStateRepo.find(clinicId, contactPhone);
      const lastMessageAt = row?.last_message_at ?? null;
      if (isConversationExpired(lastMessageAt)) {
        return { lastMessageAt };
      }
      return null;
    } catch (err) {
      log.warn("Could not read conversation_state for WhatsApp session-window check — proceeding with prescription send", {
        clinicId,
        patientPhoneMasked: maskPhoneForLog(contactPhone),
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
