/**
 * @fileoverview Server-only prescription PDF API for the scribe feature.
 *
 * Import this only from routes that generate or deliver Rx PDFs.
 * Pulls in pdf-lib, fontkit, Noto Sans font files, and node:fs.
 *
 * Usage:
 *   import { attachPrescriptionPdf, generatePrescriptionPdf } from "@/features/scribe/server-pdf";
 */

export { PrescriptionStorageService } from "./services/prescription-storage.service.js";
export { PrescriptionPdfService } from "./services/prescription-pdf.service.js";
export {
  generatePrescriptionPdf,
  buildPrescriptionDisplayFields,
  formatPrescriptionNumber,
} from "./lib/prescription-pdf.js";

import { PrescriptionStorageService } from "./services/prescription-storage.service.js";
import { PrescriptionPdfService } from "./services/prescription-pdf.service.js";
import { createScribeServices } from "./server-core.js";

/**
 * Late-bind PrescriptionPdfService onto a services bag from createScribeServices
 * (server-core). Safe to call only on routes that need Rx PDF generation.
 *
 * @param {ReturnType<typeof createScribeServices>} services
 * @returns {ReturnType<typeof createScribeServices>}
 */
export function attachPrescriptionPdf(services) {
  const prescriptionRepo = services._prescriptionRepo;
  const adminDb = services._adminDb;
  if (!prescriptionRepo || !adminDb) {
    throw new Error(
      "attachPrescriptionPdf: services must come from createScribeServices (server-core)",
    );
  }
  const storage = new PrescriptionStorageService(adminDb);
  const pdf = new PrescriptionPdfService(prescriptionRepo, storage);
  services.prescriptionPdfService = pdf;
  services.prescriptionReviewService.attachPdfService(pdf);
  return services;
}

/**
 * Convenience: createScribeServices + attachPrescriptionPdf.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient]
 */
export function createScribeServicesWithPdf(supabaseClient) {
  return attachPrescriptionPdf(createScribeServices(supabaseClient));
}
