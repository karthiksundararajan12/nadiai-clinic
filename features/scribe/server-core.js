/**
 * @fileoverview Server-only scribe API without prescription PDF / font assets.
 *
 * Prefer this for Route Handlers that need repositories or createScribeServices
 * but do not generate Rx PDFs. PDF generation lives in `./server-pdf.js`.
 *
 * Usage:
 *   import { createScribeServices } from "@/features/scribe/server-core";
 */

export * from "./client.js";

export { SessionRepository } from "./repository/session.repository.js";
export { TranscriptionRepository } from "./repository/transcription.repository.js";
export { TranscriptReviewRepository } from "./repository/transcript-review.repository.js";
export { SOAPRepository } from "./repository/soap.repository.js";
export { AuditRepository } from "./repository/audit.repository.js";
export { AuditService } from "./services/audit.service.js";
export { ScribeSessionService } from "./services/session.service.js";
export { AudioUploadService } from "./services/audio-upload.service.js";
export { TranscriptionService } from "./services/transcription.service.js";
export { TranscriptReviewService } from "./services/transcript-review.service.js";
export { SOAPGenerationService } from "./services/soap-generation.service.js";
export { SOAPReviewService } from "./services/soap-review.service.js";
export { AIProvider } from "./services/ai-providers/ai-provider.js";
export { AnthropicProvider } from "./services/ai-providers/anthropic.provider.js";
export { GeminiProvider } from "./services/ai-providers/gemini.provider.js";
export { OpenAIProvider } from "./services/ai-providers/openai.provider.js";
export {
  createSOAPAIProvider,
  resolveSOAPProviderName,
} from "./services/ai-providers/provider-factory.js";

export { TranscriptionProvider } from "./services/transcription-providers/transcription-provider.js";
export { DeepgramProvider } from "./services/transcription-providers/deepgram.provider.js";
export {
  createTranscriptionProvider,
  resolveTranscriptionProviderName,
} from "./services/transcription-providers/provider-factory.js";

export { PrescriptionRepository } from "./repository/prescription.repository.js";
export { PrescriptionService } from "./services/prescription.service.js";
export { PrescriptionReviewService } from "./services/prescription-review.service.js";
export { SOAPExportService } from "./services/soap-export.service.js";
export { AudioPlaybackService } from "./services/audio-playback.service.js";
export { formatPrescriptionNumber } from "./lib/prescription-number.js";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { SessionRepository as _SR } from "./repository/session.repository.js";
import { TranscriptionRepository as _TR } from "./repository/transcription.repository.js";
import { TranscriptReviewRepository as _RR } from "./repository/transcript-review.repository.js";
import { SOAPRepository as _SOAPRepo } from "./repository/soap.repository.js";
import { AuditRepository as _AR } from "./repository/audit.repository.js";
import { AuditService as _AS } from "./services/audit.service.js";
import { ScribeSessionService as _SSS } from "./services/session.service.js";
import { AudioUploadService as _AUS } from "./services/audio-upload.service.js";
import { TranscriptionService as _TS } from "./services/transcription.service.js";
import { TranscriptReviewService as _RS } from "./services/transcript-review.service.js";
import { SOAPGenerationService as _SOAPService } from "./services/soap-generation.service.js";
import { SOAPReviewService as _SOAPReviewService } from "./services/soap-review.service.js";
import { PrescriptionRepository as _PrescRepo } from "./repository/prescription.repository.js";
import { PrescriptionService as _PrescService } from "./services/prescription.service.js";
import { PrescriptionReviewService as _PrescReviewSvc } from "./services/prescription-review.service.js";
import { ConsultationHistoryService as _HistorySvc } from "./services/consultation-history.service.js";
import { SOAPExportService as _ExportSvc } from "./services/soap-export.service.js";
import { AudioPlaybackService as _AudioSvc } from "./services/audio-playback.service.js";
import { AppointmentRepository as _AppointmentRepo } from "../booking/repository/appointment.repository.js";

/**
 * Wires scribe domain services without prescription PDF generation.
 * Call once per request inside API route handlers (server-side only).
 *
 * For Rx PDF on approve, call `attachPrescriptionPdf` from `./server-pdf.js`.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient]
 */
export function createScribeServices(supabaseClient) {
  const supabase = supabaseClient ?? getSupabaseAdminClient();
  let adminDb = supabase;
  try {
    adminDb = getSupabaseAdminClient();
  } catch {
    adminDb = supabase;
  }
  const sessionRepo = new _SR(supabase);
  const transcriptionRepo = new _TR(supabase);
  const reviewRepo = new _RR(supabase);
  const soapRepo = new _SOAPRepo(supabase);
  const prescriptionRepo = new _PrescRepo(supabase, adminDb);
  const auditRepo = new _AR(supabase);
  const auditSvc = new _AS(auditRepo);
  const sessionSvc = new _SSS(sessionRepo, auditSvc);
  const uploadSvc = new _AUS(supabase, sessionRepo, auditSvc, sessionSvc);
  const transcriptionSvc = new _TS(supabase, sessionRepo, transcriptionRepo, auditSvc);
  const reviewSvc = new _RS(sessionRepo, reviewRepo, auditSvc);
  const soapSvc = new _SOAPService(sessionRepo, soapRepo, auditSvc);
  const appointmentRepo = new _AppointmentRepo(supabase);
  const soapReviewSvc = new _SOAPReviewService(sessionRepo, soapRepo, auditSvc, appointmentRepo);
  const prescriptionSvc = new _PrescService(sessionRepo, prescriptionRepo, auditSvc);
  const prescriptionReviewSvc = new _PrescReviewSvc(
    sessionRepo,
    prescriptionRepo,
    auditSvc,
    null,
  );
  const consultationHistorySvc = new _HistorySvc(sessionRepo, soapRepo, prescriptionRepo, auditSvc);
  const soapExportSvc = new _ExportSvc(sessionRepo, soapRepo, auditSvc);
  const audioPlaybackSvc = new _AudioSvc(sessionRepo, supabase);
  return {
    sessionService: sessionSvc,
    auditService: auditSvc,
    audioUploadService: uploadSvc,
    transcriptionService: transcriptionSvc,
    transcriptReviewService: reviewSvc,
    soapGenerationService: soapSvc,
    soapReviewService: soapReviewSvc,
    prescriptionService: prescriptionSvc,
    prescriptionReviewService: prescriptionReviewSvc,
    prescriptionPdfService: null,
    consultationHistoryService: consultationHistorySvc,
    soapExportService: soapExportSvc,
    audioPlaybackService: audioPlaybackSvc,
    /** @internal for late PDF bind */
    _supabase: supabase,
    _adminDb: adminDb,
    _prescriptionRepo: prescriptionRepo,
  };
}
