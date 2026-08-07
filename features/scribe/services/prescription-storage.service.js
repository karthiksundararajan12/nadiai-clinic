/**
 * @fileoverview Supabase Storage helper for approved prescription PDFs.
 *
 * Private bucket `prescriptions` (migration 20260807044255). Path convention:
 *   {clinic_id}/{appointment_id}.pdf
 * Full ref: prescriptions/{clinic_id}/{appointment_id}.pdf
 *
 * Uploads use the service-role client.
 */

import { PRESCRIPTION_STORAGE } from "../constants.js";
import { createLogger } from "../logger.js";
import { DatabaseError } from "../errors.js";

export class PrescriptionStorageService {
  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} supabase
   * @param {{
   *   bucket?: string;
   *   signedUrlTtlSeconds?: number;
   * }} [opts]
   */
  constructor(supabase, {
    bucket = PRESCRIPTION_STORAGE.BUCKET,
    signedUrlTtlSeconds = PRESCRIPTION_STORAGE.SIGNED_URL_TTL_SECONDS,
  } = {}) {
    this._db = supabase;
    this._bucket = bucket;
    this._signedUrlTtlSeconds = signedUrlTtlSeconds;
    this._log = createLogger({ component: "PrescriptionStorageService" });
  }

  /**
   * @param {string} clinicId
   * @param {string} appointmentId
   * @returns {string}
   */
  buildPath(clinicId, appointmentId) {
    return PRESCRIPTION_STORAGE.buildPath(clinicId, appointmentId);
  }

  /**
   * @param {{
   *   clinicId: string;
   *   appointmentId: string;
   *   pdfBytes: Uint8Array|ArrayBuffer|Buffer;
   * }} params
   * @returns {Promise<{ storagePath: string; pdfUrl: string }>}
   */
  async uploadPrescriptionPdf({ clinicId, appointmentId, pdfBytes }) {
    const storagePath = this.buildPath(clinicId, appointmentId);
    const body =
      pdfBytes instanceof Uint8Array
        ? pdfBytes
        : new Uint8Array(pdfBytes);

    const { error: uploadError } = await this._db.storage
      .from(this._bucket)
      .upload(storagePath, body, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      this._log.error("Failed to upload prescription PDF to storage", {
        clinicId,
        appointmentId,
        storagePath,
        error: uploadError.message,
      });
      throw new DatabaseError("uploadPrescriptionPdf", uploadError);
    }

    const pdfUrl = await this.createSignedUrl(storagePath);
    return { storagePath, pdfUrl };
  }

  /**
   * @param {string} storagePath
   * @returns {Promise<string>}
   */
  async createSignedUrl(storagePath) {
    const { data, error: signError } = await this._db.storage
      .from(this._bucket)
      .createSignedUrl(storagePath, this._signedUrlTtlSeconds);

    if (signError || !data?.signedUrl) {
      this._log.error("Failed to create signed URL for prescription PDF", {
        storagePath,
        error: signError?.message ?? "missing signedUrl",
      });
      throw new DatabaseError(
        "createPrescriptionSignedUrl",
        signError ?? new Error("missing signedUrl"),
      );
    }

    return data.signedUrl;
  }
}
