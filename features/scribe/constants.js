/**
 * @fileoverview AI Scribe domain constants.
 * Single source of truth for all state machines, enums, and
 * configuration values used across the scribe feature.
 */

// ─────────────────────────────────────────────────────────────
// SESSION STATUS STATE MACHINE
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const SESSION_STATUS = Object.freeze({
  CREATED:                 "CREATED",
  RECORDING:               "RECORDING",
  UPLOADING:               "UPLOADING",
  UPLOADED:                "UPLOADED",
  TRANSCRIPTION_QUEUED:    "TRANSCRIPTION_QUEUED",
  TRANSCRIBING:            "TRANSCRIBING",
  TRANSCRIBED:             "TRANSCRIBED",
  TRANSCRIPTION_FAILED:    "TRANSCRIPTION_FAILED",
  REVIEWING:               "REVIEWING",
  REVIEW_COMPLETED:        "REVIEW_COMPLETED",
  READY_FOR_SOAP:          "READY_FOR_SOAP",
  GENERATING_SOAP:         "GENERATING_SOAP",
  SOAP_READY:              "SOAP_READY",
  SOAP_REVIEW_REQUIRED:    "SOAP_REVIEW_REQUIRED",
  SOAP_REVIEWING:          "SOAP_REVIEWING",
  SOAP_APPROVED:           "SOAP_APPROVED",
  READY_FOR_PRESCRIPTION:    "READY_FOR_PRESCRIPTION",
  GENERATING_PRESCRIPTION:   "GENERATING_PRESCRIPTION",
  PRESCRIPTION_DRAFT_READY:       "PRESCRIPTION_DRAFT_READY",
  PRESCRIPTION_REVIEW_REQUIRED:   "PRESCRIPTION_REVIEW_REQUIRED",
  PRESCRIPTION_REVIEWING:         "PRESCRIPTION_REVIEWING",
  PRESCRIPTION_APPROVED:          "PRESCRIPTION_APPROVED",
  COMPLETED:                      "COMPLETED",
  FAILED:                         "FAILED",
});

/**
 * Defines every valid state transition.
 * Key = current state; Value = array of permitted next states.
 * Any transition NOT in this map is rejected by the service layer.
 *
 * @type {Record<string, string[]>}
 */
export const VALID_TRANSITIONS = Object.freeze({
  [SESSION_STATUS.CREATED]:                 [SESSION_STATUS.RECORDING, SESSION_STATUS.FAILED],
  [SESSION_STATUS.RECORDING]:               [SESSION_STATUS.UPLOADING, SESSION_STATUS.FAILED],
  [SESSION_STATUS.UPLOADING]:               [SESSION_STATUS.UPLOADED, SESSION_STATUS.CREATED, SESSION_STATUS.FAILED],
  // UPLOADING → CREATED: doctor cancels mid-upload
  [SESSION_STATUS.UPLOADED]:                [SESSION_STATUS.TRANSCRIPTION_QUEUED, SESSION_STATUS.TRANSCRIBING, SESSION_STATUS.FAILED],
  [SESSION_STATUS.TRANSCRIPTION_QUEUED]:    [SESSION_STATUS.TRANSCRIBING, SESSION_STATUS.TRANSCRIPTION_FAILED, SESSION_STATUS.FAILED],
  [SESSION_STATUS.TRANSCRIBING]:            [SESSION_STATUS.TRANSCRIBED, SESSION_STATUS.TRANSCRIPTION_FAILED, SESSION_STATUS.FAILED],
  [SESSION_STATUS.TRANSCRIPTION_FAILED]:    [SESSION_STATUS.TRANSCRIPTION_QUEUED, SESSION_STATUS.UPLOADED, SESSION_STATUS.FAILED],
  [SESSION_STATUS.TRANSCRIBED]:             [SESSION_STATUS.REVIEWING, SESSION_STATUS.READY_FOR_SOAP],
  [SESSION_STATUS.REVIEWING]:               [SESSION_STATUS.REVIEW_COMPLETED, SESSION_STATUS.TRANSCRIBED, SESSION_STATUS.FAILED],
  [SESSION_STATUS.REVIEW_COMPLETED]:        [SESSION_STATUS.READY_FOR_SOAP, SESSION_STATUS.GENERATING_SOAP],
  [SESSION_STATUS.READY_FOR_SOAP]:          [SESSION_STATUS.GENERATING_SOAP, SESSION_STATUS.FAILED],
  [SESSION_STATUS.GENERATING_SOAP]:         [SESSION_STATUS.SOAP_READY, SESSION_STATUS.SOAP_REVIEW_REQUIRED, SESSION_STATUS.REVIEW_COMPLETED, SESSION_STATUS.READY_FOR_SOAP, SESSION_STATUS.FAILED],
  // GENERATING_SOAP → READY_FOR_SOAP: retry path (generation failed, not a terminal failure)
  [SESSION_STATUS.SOAP_READY]:              [SESSION_STATUS.SOAP_REVIEW_REQUIRED, SESSION_STATUS.GENERATING_SOAP, SESSION_STATUS.GENERATING_PRESCRIPTION, SESSION_STATUS.COMPLETED],
  [SESSION_STATUS.SOAP_REVIEW_REQUIRED]:    [SESSION_STATUS.SOAP_REVIEWING, SESSION_STATUS.GENERATING_SOAP, SESSION_STATUS.COMPLETED],
  [SESSION_STATUS.SOAP_REVIEWING]:          [SESSION_STATUS.SOAP_APPROVED, SESSION_STATUS.SOAP_REVIEW_REQUIRED, SESSION_STATUS.GENERATING_SOAP, SESSION_STATUS.FAILED],
  [SESSION_STATUS.SOAP_APPROVED]:           [SESSION_STATUS.READY_FOR_PRESCRIPTION, SESSION_STATUS.GENERATING_PRESCRIPTION],
  [SESSION_STATUS.READY_FOR_PRESCRIPTION]:  [SESSION_STATUS.GENERATING_PRESCRIPTION, SESSION_STATUS.COMPLETED],
  // SOAP_READY → COMPLETED: when no prescription is needed
  [SESSION_STATUS.GENERATING_PRESCRIPTION]: [SESSION_STATUS.PRESCRIPTION_DRAFT_READY, SESSION_STATUS.SOAP_APPROVED, SESSION_STATUS.COMPLETED, SESSION_STATUS.FAILED],
  // GENERATING_PRESCRIPTION → SOAP_APPROVED: roll-back on failure
  [SESSION_STATUS.PRESCRIPTION_DRAFT_READY]:      [SESSION_STATUS.PRESCRIPTION_REVIEW_REQUIRED],
  [SESSION_STATUS.PRESCRIPTION_REVIEW_REQUIRED]:  [SESSION_STATUS.PRESCRIPTION_REVIEWING, SESSION_STATUS.SOAP_APPROVED],
  // PRESCRIPTION_REVIEW_REQUIRED → SOAP_APPROVED: doctor requests regeneration
  [SESSION_STATUS.PRESCRIPTION_REVIEWING]:        [SESSION_STATUS.PRESCRIPTION_APPROVED, SESSION_STATUS.PRESCRIPTION_REVIEW_REQUIRED, SESSION_STATUS.SOAP_APPROVED],
  // PRESCRIPTION_REVIEWING → SOAP_APPROVED: reject + regenerate path
  [SESSION_STATUS.PRESCRIPTION_APPROVED]:         [SESSION_STATUS.COMPLETED],
  [SESSION_STATUS.COMPLETED]:                     [],
  // COMPLETED is terminal — amendments go through scribe_documents versioning
  [SESSION_STATUS.FAILED]:                  [SESSION_STATUS.UPLOADED, SESSION_STATUS.TRANSCRIPTION_QUEUED],
  // FAILED → UPLOADED/TRANSCRIPTION_QUEUED: manual recovery path
});

/** States where no further user or system action should modify session data. */
export const TERMINAL_STATUSES = Object.freeze([
  SESSION_STATUS.COMPLETED,
]);

/** States where the system is actively processing (no doctor action expected). */
export const PROCESSING_STATUSES = Object.freeze([
  SESSION_STATUS.UPLOADING,
  SESSION_STATUS.TRANSCRIPTION_QUEUED,
  SESSION_STATUS.TRANSCRIBING,
  SESSION_STATUS.GENERATING_SOAP,
  SESSION_STATUS.GENERATING_PRESCRIPTION,
]);

/** States where the doctor must take action to progress. */
export const ACTIONABLE_STATUSES = Object.freeze([
  SESSION_STATUS.TRANSCRIBED,
  SESSION_STATUS.TRANSCRIPTION_FAILED,
  SESSION_STATUS.REVIEWING,
  SESSION_STATUS.SOAP_READY,
  SESSION_STATUS.SOAP_REVIEW_REQUIRED,
  SESSION_STATUS.SOAP_REVIEWING,
  SESSION_STATUS.SOAP_APPROVED,
  SESSION_STATUS.READY_FOR_PRESCRIPTION,
  SESSION_STATUS.PRESCRIPTION_DRAFT_READY,
  SESSION_STATUS.PRESCRIPTION_REVIEW_REQUIRED,
  SESSION_STATUS.PRESCRIPTION_REVIEWING,
  SESSION_STATUS.FAILED,
]);

// ─────────────────────────────────────────────────────────────
// LANGUAGES
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const SCRIBE_LANGUAGE = Object.freeze({
  HINGLISH: "hinglish",
  HINDI:    "hindi",
  ENGLISH:  "english",
});

// ─────────────────────────────────────────────────────────────
// PROCESSING QUEUE
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const JOB_TYPE = Object.freeze({
  TRANSCRIBE:              "transcribe",
  GENERATE_SOAP:           "generate_soap",
  GENERATE_SUMMARY:        "generate_summary",
  GENERATE_PRESCRIPTION:   "generate_prescription",
  GENERATE_ICD:            "generate_icd",
});

/** @enum {string} */
export const JOB_STATUS = Object.freeze({
  PENDING:    "pending",
  PROCESSING: "processing",
  COMPLETED:  "completed",
  FAILED:     "failed",
  CANCELLED:  "cancelled",
});

/** Priority values for the processing queue (1=low, 10=urgent). */
export const JOB_PRIORITY = Object.freeze({
  LOW:    1,
  NORMAL: 5,
  HIGH:   8,
  URGENT: 10,
});

/** Retry backoff schedule in minutes per attempt number (1-indexed). */
export const JOB_RETRY_BACKOFF_MINUTES = Object.freeze([0, 1, 5, 30]);

// ─────────────────────────────────────────────────────────────
// TRANSCRIPTION
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const TRANSCRIPTION_STATUS = Object.freeze({
  QUEUED:     "queued",
  PROCESSING: "processing",
  COMPLETED:  "completed",
  FAILED:     "failed",
});

export const TRANSCRIPTION_CONFIG = Object.freeze({
  /** Active provider — overridden by TRANSCRIPTION_PROVIDER env var. */
  PROVIDER: "deepgram",
  /** Default Deepgram model for English medical audio. */
  DEFAULT_MODEL: "nova-2-medical",
  /** Confidence score below which a segment is flagged as low-confidence. */
  LOW_CONFIDENCE_THRESHOLD: 0.75,
  MAX_ATTEMPTS: 3,
  WORKER_BATCH_SIZE: 1,
  STALE_JOB_MINUTES: 15,
  /**
   * Deepgram Nova-2 Medical pricing estimate (USD cents per audio minute).
   * Actual billed cost comes from result.costCents in the provider response.
   */
  DEFAULT_COST_PER_AUDIO_MINUTE_CENTS: 0.59,
});

// ─────────────────────────────────────────────────────────────
// SOAP GENERATION
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const AI_PROVIDER = Object.freeze({
  ANTHROPIC: "anthropic",
  OPENAI:    "openai",
  GEMINI:    "gemini",
});

/** @enum {string} */
export const SOAP_NOTE_STATUS = Object.freeze({
  GENERATING:       "generating",
  READY:            "ready",
  REVIEW_REQUIRED:  "review_required",
  REVIEWING:        "reviewing",
  APPROVED:         "approved",
  REJECTED:         "rejected",
  FAILED:           "failed",
});

export const SOAP_SECTION = Object.freeze({
  CHIEF_COMPLAINT: "chiefComplaint",
  HPI: "historyOfPresentIllness",
  SUBJECTIVE: "subjective",
  OBJECTIVE: "objective",
  ASSESSMENT: "assessment",
  PLAN: "plan",
  CLINICAL_SUMMARY: "clinicalSummary",
});

export const SOAP_GENERATION_CONFIG = Object.freeze({
  DEFAULT_PROVIDER: AI_PROVIDER.ANTHROPIC,
  DEFAULT_CLAUDE_MODEL: "claude-3-5-sonnet-latest",
  DEFAULT_OPENAI_MODEL: "gpt-4.1-mini",
  DEFAULT_GEMINI_MODEL: "gemini-2.5-flash",
  PROMPT_VERSION: "soap_indian_gp_v1",
  MAX_ATTEMPTS: 3,
  TEMPERATURE: 0.1,
  MAX_OUTPUT_TOKENS: 1800,
});

/** @enum {string} */
export const PRESCRIPTION_DRAFT_STATUS = Object.freeze({
  GENERATING:       "generating",
  DRAFT_READY:      "draft_ready",
  REVIEW_REQUIRED:  "review_required",
  REVIEWING:        "reviewing",
  APPROVED:         "approved",
  REJECTED:         "rejected",
  FAILED:           "failed",
});

/** @enum {string} */
export const PRESCRIPTION_REVIEW_STATUS = Object.freeze({
  REVIEWING: "reviewing",
  APPROVED:  "approved",
  REJECTED:  "rejected",
});

export const PRESCRIPTION_GENERATION_CONFIG = Object.freeze({
  /** Prompt template identifier stored in every draft row for reproducibility. */
  PROMPT_VERSION: "prescription_indian_gp_v1",
  MAX_ATTEMPTS:   3,
  TEMPERATURE:    0.05,
  MAX_OUTPUT_TOKENS: 1200,
  /**
   * Minimum confidence score below which a medication is flagged in warnings.
   * Range 0.0 – 1.0.
   */
  LOW_CONFIDENCE_THRESHOLD: 0.7,
});

// ─────────────────────────────────────────────────────────────
// AUDIT ACTIONS
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const AUDIT_ACTION = Object.freeze({
  SESSION_CREATED:           "session_created",
  SESSION_UPDATED:           "session_updated",
  SESSION_DELETED:           "session_deleted",
  RECORDING_STARTED:         "recording_started",
  RECORDING_STOPPED:         "recording_stopped",
  UPLOAD_STARTED:            "upload_started",
  UPLOAD_SIGNED_URL_CREATED: "upload_signed_url_created",
  UPLOAD_CHUNK_CONFIRMED:    "upload_chunk_confirmed",
  UPLOAD_RETRY_REQUESTED:    "upload_retry_requested",
  UPLOAD_FINALIZED:          "upload_finalized",
  UPLOAD_FAILED:             "upload_failed",
  CHUNK_UPLOADED:            "chunk_uploaded",
  SESSION_FINALIZED:         "session_finalized",
  STATE_TRANSITIONED:        "state_transitioned",
  TRANSCRIPTION_QUEUED:      "transcription_queued",
  TRANSCRIPTION_STARTED:     "transcription_started",
  TRANSCRIPTION_COMPLETED:   "transcription_completed",
  TRANSCRIPTION_FAILED:      "transcription_failed",
  TRANSCRIPT_EDITED:         "transcript_edited",
  TRANSCRIPT_VERSION_CREATED:"transcript_version_created",
  TRANSCRIPT_VERSION_RESTORED:"transcript_version_restored",
  REVIEW_STARTED:            "review_started",
  REVIEW_COMPLETED:          "review_completed",
  SPEAKER_CORRECTED:         "speaker_corrected",
  GENERATION_TRIGGERED:      "generation_triggered",
  SOAP_GENERATED:            "soap_generated",
  SOAP_GENERATION_STARTED:   "soap_generation_started",
  SOAP_GENERATION_FAILED:    "soap_generation_failed",
  SOAP_VERSION_CREATED:      "soap_version_created",
  SOAP_REVIEW_STARTED:       "soap_review_started",
  SOAP_SECTION_EDITED:       "soap_section_edited",
  SOAP_MANUAL_SAVE:          "soap_manual_save",
  SOAP_APPROVED:             "soap_approved",
  SOAP_REJECTED:             "soap_rejected",
  PRESCRIPTION_GENERATION_STARTED:  "prescription_generation_started",
  PRESCRIPTION_GENERATED:           "prescription_generated",
  PRESCRIPTION_GENERATION_FAILED:   "prescription_generation_failed",
  PRESCRIPTION_VERSION_CREATED:     "prescription_version_created",
  PRESCRIPTION_REVIEW_STARTED:      "prescription_review_started",
  PRESCRIPTION_FIELD_EDITED:        "prescription_field_edited",
  PRESCRIPTION_SAVED:               "prescription_saved",
  PRESCRIPTION_APPROVED:            "prescription_approved",
  PRESCRIPTION_REJECTED:            "prescription_rejected",
  SESSION_REVIEWED:                 "session_reviewed",
  SESSION_SIGNED:            "session_signed",
  SESSION_EXPORTED:          "session_exported",
  JOB_TIMEOUT:               "job_timeout",
  JOB_RETRY:                 "job_retry",
  UNAUTHORIZED_ACCESS_ATTEMPT: "unauthorized_access_attempt",
});

// ─────────────────────────────────────────────────────────────
// BUSINESS RULES
// ─────────────────────────────────────────────────────────────

export const SCRIBE_LIMITS = Object.freeze({
  /** Maximum recording duration in seconds before auto-stop. */
  MAX_RECORDING_SECONDS: 90 * 60,

  /** Warning shown to doctor at this recording duration (seconds). */
  RECORDING_WARNING_SECONDS: 45 * 60,

  /** Size of each audio chunk uploaded in milliseconds. */
  CHUNK_INTERVAL_MS: 30_000,

  /** Maximum audio file size accepted for transcription in bytes (200 MB). */
  MAX_AUDIO_SIZE_BYTES: 200 * 1024 * 1024,

  /** Whisper file size limit per API call in bytes (25 MB). */
  WHISPER_MAX_BYTES: 25 * 1024 * 1024,

  /** Transcript segment confidence threshold below which segments are flagged. */
  LOW_CONFIDENCE_THRESHOLD: 0.75,

  /** Maximum daily transcription jobs per doctor. */
  MAX_DAILY_TRANSCRIPTIONS: 100,

  /** Minutes before a stuck PROCESSING job is reclaimed by watchdog. */
  STUCK_JOB_TIMEOUT_MINUTES: 10,

  /** Sessions in UPLOADING state older than this are auto-expired. */
  STALE_UPLOAD_HOURS: 24,

  /** Minimum IndexedDB storage required before allowing recording (bytes). */
  MIN_AVAILABLE_STORAGE_BYTES: 500 * 1024 * 1024,
});

// ─────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────

export const SCRIBE_STORAGE = Object.freeze({
  BUCKET: "scribe-audio",
  /** Signed upload URLs are short lived to reduce token replay risk. */
  SIGNED_UPLOAD_TTL_SECONDS: 60 * 15,
  /** Build the storage prefix for a session's audio files. */
  buildPrefix: (clinicId, doctorId, sessionId) =>
    `${clinicId}/${doctorId}/${sessionId}`,
  /** Build the path for a specific chunk. */
  buildChunkPath: (prefix, chunkIndex, extension = "webm") =>
    `${prefix}/chunks/${String(chunkIndex).padStart(4, "0")}.${extension}`,
});
