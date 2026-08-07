/**
 * @fileoverview PrescriptionPdfService — generate + store an approved
 * prescription PDF after PrescriptionReviewService.approve succeeds.
 *
 * Best-effort side effect: failures here must never roll back approval.
 *
 * Flow:
 *   1. Idempotent: if the draft already has prescription_number +
 *      pdf_storage_path, reuse (re-sign URL).
 *   2. Else allocate next RX-###### for clinic_id, generate PDF, upload
 *      via service-role storage, persist number + path on the draft.
 */

import { createLogger } from "../logger.js";
import { generatePrescriptionPdf } from "../lib/prescription-pdf.js";
import { getDoctorRegistrationNumber } from "../lib/prescription-registration-gate.js";

export class PrescriptionPdfService {
  /**
   * @param {import("../repository/prescription.repository.js").PrescriptionRepository} prescriptionRepo
   * @param {import("./prescription-storage.service.js").PrescriptionStorageService} storage
   */
  constructor(prescriptionRepo, storage) {
    this._prescriptions = prescriptionRepo;
    this._storage = storage;
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
   * }|null>}
   */
  async deliverForApprovedDraft({ session, draft, ctx }) {
    const log = this._log.child({
      clinicId: ctx.clinicId,
      sessionId: session.id,
      draftId: draft.id,
    });

    try {
      if (draft.prescription_number && draft.pdf_storage_path) {
        const pdfUrl = await this._storage.createSignedUrl(draft.pdf_storage_path);
        log.info("Reusing existing prescription PDF (idempotent)", {
          prescriptionNumber: draft.prescription_number,
          storagePath: draft.pdf_storage_path,
        });
        return {
          prescriptionNumber: draft.prescription_number,
          storagePath: draft.pdf_storage_path,
          pdfUrl,
          reused: true,
        };
      }

      const appointmentId =
        (typeof draft.appointment_id === "string" && draft.appointment_id) ||
        (typeof session.appointment_id === "string" && session.appointment_id) ||
        null;

      if (!appointmentId) {
        log.warn("Skipping prescription PDF — no appointment_id on session/draft");
        return null;
      }

      const allocated = await this._prescriptions.allocateNextNumber(ctx.clinicId);
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
        prescriptionNumber: allocated.prescriptionNumber,
        draft: draft.draft ?? {},
      });

      const uploaded = await this._storage.uploadPrescriptionPdf({
        clinicId: ctx.clinicId,
        appointmentId,
        pdfBytes,
      });

      await this._prescriptions.updateDraftFields(draft.id, {
        prescription_number: allocated.prescriptionNumber,
        prescription_seq: allocated.prescriptionSeq,
        pdf_storage_path: uploaded.storagePath,
      });

      log.info("Generated and stored prescription PDF", {
        prescriptionNumber: allocated.prescriptionNumber,
        storagePath: uploaded.storagePath,
      });

      return {
        prescriptionNumber: allocated.prescriptionNumber,
        storagePath: uploaded.storagePath,
        pdfUrl: uploaded.pdfUrl,
        reused: false,
      };
    } catch (err) {
      log.error("Failed to generate/store prescription PDF (approval unaffected)", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
