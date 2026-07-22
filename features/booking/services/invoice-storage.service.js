/**
 * @fileoverview Supabase Storage helper for booking invoice PDFs.
 *
 * Private bucket `booking-invoices` (migration 024). Path convention:
 *   invoices/{clinic_id}/{appointment_id}.pdf
 *
 * Uploads use the service-role client. Meta / WhatsApp document sends need
 * a short-lived HTTPS signed URL — never a public object URL.
 */

import { INVOICE_STORAGE } from "../constants.js";
import { createLogger } from "../logger.js";
import { DatabaseError } from "../errors.js";

export class InvoiceStorageService {
  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} supabase
   * @param {{
   *   bucket?: string;
   *   signedUrlTtlSeconds?: number;
   * }} [opts]
   */
  constructor(supabase, {
    bucket = INVOICE_STORAGE.BUCKET,
    signedUrlTtlSeconds = INVOICE_STORAGE.SIGNED_URL_TTL_SECONDS,
  } = {}) {
    this._db = supabase;
    this._bucket = bucket;
    this._signedUrlTtlSeconds = signedUrlTtlSeconds;
    this._log = createLogger({ component: "InvoiceStorageService" });
  }

  /**
   * @param {string} clinicId
   * @param {string} appointmentId
   * @returns {string}
   */
  buildPath(clinicId, appointmentId) {
    return INVOICE_STORAGE.buildPath(clinicId, appointmentId);
  }

  /**
   * Uploads PDF bytes (upsert) and returns the object path + signed URL.
   *
   * @param {{
   *   clinicId: string;
   *   appointmentId: string;
   *   pdfBytes: Uint8Array|ArrayBuffer|Buffer;
   * }} params
   * @returns {Promise<{ storagePath: string; pdfUrl: string }>}
   */
  async uploadInvoicePdf({ clinicId, appointmentId, pdfBytes }) {
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
      this._log.error("Failed to upload invoice PDF to storage", {
        clinicId,
        appointmentId,
        storagePath,
        error: uploadError.message,
      });
      throw new DatabaseError("uploadInvoicePdf", uploadError);
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
      this._log.error("Failed to create signed URL for invoice PDF", {
        storagePath,
        error: signError?.message ?? "missing signedUrl",
      });
      throw new DatabaseError("createInvoiceSignedUrl", signError ?? new Error("missing signedUrl"));
    }

    return data.signedUrl;
  }
}
