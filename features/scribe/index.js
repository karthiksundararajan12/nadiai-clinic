/**
 * @fileoverview features/scribe — public API barrel.
 *
 * Import from here in all API routes and pages.
 * Never import directly from sub-directories to preserve
 * the feature boundary.
 *
 * Usage:
 *   import { createScribeServices, SESSION_STATUS } from "@/features/scribe";
 */

// ─────────────────────────────────────────────────────────────
// DOMAIN EXPORTS
// ─────────────────────────────────────────────────────────────

export {
  SESSION_STATUS,
  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
  PROCESSING_STATUSES,
  ACTIONABLE_STATUSES,
  SCRIBE_LANGUAGE,
  JOB_TYPE,
  JOB_STATUS,
  JOB_PRIORITY,
  TRANSCRIPTION_STATUS,
  TRANSCRIPTION_CONFIG,
  AI_PROVIDER,
  SOAP_NOTE_STATUS,
  SOAP_SECTION,
  SOAP_GENERATION_CONFIG,
  AUDIT_ACTION,
  SCRIBE_LIMITS,
  SCRIBE_STORAGE,
} from "./constants.js";

export {
  ScribeError,
  SessionNotFoundError,
  InvalidStateTransitionError,
  SessionFinalizedError,
  SessionAlreadyActiveError,
  UnauthorizedSessionAccessError,
  SessionValidationError,
  SessionConflictError,
  DatabaseError,
  AuditLogError,
  StorageError,
  UploadValidationError,
  UploadNotReadyError,
  UploadExpiredError,
  UploadIntegrityError,
  TranscriptionNotReadyError,
  TranscriptionProviderError,
  TranscriptionRetryExhaustedError,
  WorkerUnauthorizedError,
  SOAPGenerationError,
  SOAPValidationError,
  SOAPNotReadyError,
  QuotaExceededError,
  isScribeError,
  toApiError,
} from "./errors.js";

export {
  CreateSessionSchema,
  UpdateSessionSchema,
  TransitionStateSchema,
  FinalizeSessionSchema,
  RegisterChunkSchema,
  StartAudioUploadSchema,
  UploadChunkManifestSchema,
  ConfirmAudioChunkSchema,
  RetryAudioUploadSchema,
  FinalizeAudioUploadSchema,
  QueueTranscriptionSchema,
  RetryTranscriptionSchema,
  TranscriptionWorkerSchema,
  RecoverTranscriptionJobsSchema,
  ReviewSegmentUpdateSchema,
  SaveTranscriptVersionSchema,
  RestoreTranscriptVersionSchema,
  CompleteReviewSchema,
  SOAPNoteSchema,
  GenerateSOAPNoteSchema,
  RetrySOAPGenerationSchema,
  SOAPSectionKeySchema,
  UpdateSOAPSectionSchema,
  SaveSOAPVersionSchema,
  CompareSOAPVersionsSchema,
  ApproveSOAPNoteSchema,
  RejectSOAPNoteSchema,
  SessionFilterSchema,
  PatchSessionSchema,
  TranscriptSegmentSchema,
} from "./schemas.js";

export { createLogger, scribeLogger } from "./logger.js";

// ─────────────────────────────────────────────────────────────
// REPOSITORY + SERVICE EXPORTS
// ─────────────────────────────────────────────────────────────

export { SessionRepository }     from "./repository/session.repository.js";
export { TranscriptionRepository } from "./repository/transcription.repository.js";
export { TranscriptReviewRepository } from "./repository/transcript-review.repository.js";
export { SOAPRepository } from "./repository/soap.repository.js";
export { AuditRepository }       from "./repository/audit.repository.js";
export { AuditService }          from "./services/audit.service.js";
export { ScribeSessionService }  from "./services/session.service.js";
export { AudioUploadService }    from "./services/audio-upload.service.js";
export { TranscriptionService }  from "./services/transcription.service.js";
export { TranscriptReviewService } from "./services/transcript-review.service.js";
export { SOAPGenerationService } from "./services/soap-generation.service.js";
export { SOAPReviewService } from "./services/soap-review.service.js";
export { AIProvider } from "./services/ai-providers/ai-provider.js";
export { AnthropicProvider } from "./services/ai-providers/anthropic.provider.js";
export { OpenAIProvider } from "./services/ai-providers/openai.provider.js";
export {
  createSOAPAIProvider,
  resolveSOAPProviderName,
} from "./services/ai-providers/provider-factory.js";

// ─────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { SessionRepository as _SR }     from "./repository/session.repository.js";
import { TranscriptionRepository as _TR } from "./repository/transcription.repository.js";
import { TranscriptReviewRepository as _RR } from "./repository/transcript-review.repository.js";
import { SOAPRepository as _SOAPRepo } from "./repository/soap.repository.js";
import { AuditRepository   as _AR }     from "./repository/audit.repository.js";
import { AuditService      as _AS }     from "./services/audit.service.js";
import { ScribeSessionService as _SSS } from "./services/session.service.js";
import { AudioUploadService as _AUS }    from "./services/audio-upload.service.js";
import { TranscriptionService as _TS }    from "./services/transcription.service.js";
import { TranscriptReviewService as _RS } from "./services/transcript-review.service.js";
import { SOAPGenerationService as _SOAPService } from "./services/soap-generation.service.js";
import { SOAPReviewService as _SOAPReviewService } from "./services/soap-review.service.js";

/**
 * Wires together all scribe domain services with a Supabase client.
 * Call once per request inside API route handlers (server-side only).
 *
 * Prefer passing the authenticated server client (from getSupabaseServerClient())
 * so that Supabase RLS applies — this works for all scribe operations because
 * every table has auth.uid()-based policies. Falls back to the admin client
 * when no client is provided (requires a valid SUPABASE_SERVICE_ROLE_KEY JWT).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient]
 * @returns {{ sessionService: ScribeSessionService; auditService: AuditService }}
 */
export function createScribeServices(supabaseClient) {
  const supabase    = supabaseClient ?? getSupabaseAdminClient();
  const sessionRepo = new _SR(supabase);
  const transcriptionRepo = new _TR(supabase);
  const reviewRepo = new _RR(supabase);
  const soapRepo = new _SOAPRepo(supabase);
  const auditRepo   = new _AR(supabase);
  const auditSvc    = new _AS(auditRepo);
  const sessionSvc  = new _SSS(sessionRepo, auditSvc);
  const uploadSvc   = new _AUS(supabase, sessionRepo, auditSvc, sessionSvc);
  const transcriptionSvc = new _TS(supabase, sessionRepo, transcriptionRepo, auditSvc);
  const reviewSvc = new _RS(sessionRepo, reviewRepo, auditSvc);
  const soapSvc = new _SOAPService(sessionRepo, soapRepo, auditSvc);
  const soapReviewSvc = new _SOAPReviewService(sessionRepo, soapRepo, auditSvc);
  return {
    sessionService: sessionSvc,
    auditService: auditSvc,
    audioUploadService: uploadSvc,
    transcriptionService: transcriptionSvc,
    transcriptReviewService: reviewSvc,
    soapGenerationService: soapSvc,
    soapReviewService: soapReviewSvc,
  };
}
