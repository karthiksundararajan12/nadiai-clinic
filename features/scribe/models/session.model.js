/**
 * @fileoverview JSDoc type definitions for all scribe domain models.
 *
 * These types mirror the Postgres schema exactly. Every property that
 * can be NULL in Postgres is typed as `T | null` here.
 *
 * No runtime code in this file — pure documentation and IDE support.
 */

// ─────────────────────────────────────────────────────────────
// TRANSCRIPT SEGMENT
// ─────────────────────────────────────────────────────────────

/**
 * A single spoken segment within a consultation transcript.
 *
 * @typedef {Object} TranscriptSegment
 * @property {string}  id             - Unique segment identifier
 * @property {number}  start          - Start time in seconds from recording start
 * @property {number}  end            - End time in seconds
 * @property {string}  text           - Transcribed text for this segment
 * @property {"A"|"B"|"C"} speaker   - Internal diarization speaker key
 * @property {"Doctor"|"Patient"|"Attendant"} speaker_label - Human-readable label
 * @property {number}  confidence     - Whisper confidence score [0, 1]
 * @property {boolean} [edited]       - True if doctor has manually edited this segment
 */

// ─────────────────────────────────────────────────────────────
// SCRIBE SESSION
// ─────────────────────────────────────────────────────────────

/**
 * The core domain aggregate for a single consultation recording session.
 *
 * @typedef {Object} ScribeSession
 * @property {string}      id                     - UUID primary key
 * @property {string}      doctor_id              - References auth.users(id)
 * @property {string}      clinic_id              - References clinics(id)
 * @property {string|null} patient_id             - References patients(id)
 * @property {string|null} appointment_id         - References appointments(id)
 * @property {string}      language               - One of: "hinglish" | "hindi" | "english"
 * @property {string}      status                 - Current state machine status
 * @property {number}      upload_progress        - Upload percentage [0–100]
 * @property {string|null} audio_storage_prefix   - Supabase Storage prefix for audio files
 * @property {number|null} audio_total_chunks     - Total chunks expected
 * @property {number}      audio_confirmed_chunks - Chunks confirmed received by server
 * @property {number|null} audio_duration_seconds - Total recording duration
 * @property {number|null} audio_size_bytes       - Total audio size in bytes
 * @property {TranscriptSegment[]|null} edited_transcript   - Doctor-edited transcript segments
 * @property {Record<string,string>|null} speaker_corrections - Speaker label overrides
 * @property {string|null} error_message          - Human-readable last error
 * @property {boolean}     is_finalized           - True once signed/locked
 * @property {string|null} signed_at              - ISO 8601 timestamp when doctor signed
 * @property {string|null} reviewed_at            - ISO 8601 timestamp of last review
 * @property {string|null} deleted_at             - Soft delete timestamp
 * @property {string}      created_at             - ISO 8601 creation timestamp
 * @property {string}      updated_at             - ISO 8601 last update timestamp
 * -- Legacy columns kept for backward compat (nullable after migration)
 * @property {unknown[]|null} transcription       - Legacy JSONB (deprecated, use scribe_transcriptions)
 * @property {string|null} clinical_note          - Legacy TEXT (deprecated, use scribe_documents)
 * @property {number}      duration               - Legacy seconds field
 */

// ─────────────────────────────────────────────────────────────
// SCRIBE AUDIO CHUNK
// ─────────────────────────────────────────────────────────────

/**
 * Represents a single uploaded audio chunk for a session.
 *
 * @typedef {Object} ScribeAudioChunk
 * @property {string}  id              - UUID primary key
 * @property {string}  session_id      - References scribe_sessions(id)
 * @property {number}  chunk_index     - Zero-based position in the recording
 * @property {string}  storage_path    - Full path within the scribe-audio bucket
 * @property {number}  size_bytes      - Compressed chunk size in bytes
 * @property {number}  duration_ms     - Duration of this chunk in milliseconds
 * @property {string|null} checksum    - SHA-256 hex digest for integrity verification
 * @property {string|null} mime_type   - Audio MIME type for this chunk
 * @property {"pending"|"signed"|"uploaded"|"failed"} upload_status - Upload lifecycle status
 * @property {string|null} error_message - Last upload error, if any
 * @property {string|null} signed_url_expires_at - ISO 8601 expiration for the latest signed URL
 * @property {string|null} uploaded_at  - ISO 8601 timestamp when confirmed uploaded
 * @property {boolean} confirmed       - True once integrity-verified by the server
 * @property {number}  upload_attempts - Number of upload attempts (for debugging)
 * @property {string}  created_at      - ISO 8601 timestamp
 * @property {string}  updated_at      - ISO 8601 timestamp
 */

// ─────────────────────────────────────────────────────────────
// SCRIBE TRANSCRIPTION
// ─────────────────────────────────────────────────────────────

/**
 * Transcription record created by the Whisper processing worker.
 * One row per session (UNIQUE constraint on session_id).
 *
 * @typedef {Object} ScribeTranscription
 * @property {string}               id                       - UUID primary key
 * @property {string}               session_id               - References scribe_sessions(id)
 * @property {string|null}          full_text                - Complete transcript as plain text
 * @property {TranscriptSegment[]}  segments                 - Speaker-diarized segments
 * @property {Record<string,string>} speaker_map             - Initial diarization labels e.g. {"A":"Doctor"}
 * @property {TranscriptSegment[]}  low_confidence_segments  - Segments below confidence threshold
 * @property {number}               low_confidence_count     - Count of low-confidence segments
 * @property {string|null}          whisper_detected_language - Whisper's language detection result
 * @property {string}               transcription_model      - Model used (e.g. "whisper-1")
 * @property {number}               chunk_count              - Number of audio chunks processed
 * @property {number}               cost_cents               - Transcription cost in cents (USD)
 * @property {number|null}          processing_duration_ms   - Wall-clock time for transcription
 * @property {string}               status                   - "pending"|"processing"|"completed"|"failed"
 * @property {number}               attempt_count            - Number of processing attempts
 * @property {string|null}          error                    - Last error message if status=failed
 * @property {string|null}          provider                 - STT provider, e.g. "openai"
 * @property {string|null}          model                    - Provider model, e.g. "whisper-1"
 * @property {string|null}          text                     - Normalized transcript text
 * @property {number|null}          average_confidence       - Mean confidence across segments
 * @property {Record<string,unknown>} confidence_summary     - Low-confidence counters and thresholds
 * @property {Record<string,unknown>|null} provider_response - Redacted provider metadata, no raw audio
 * @property {string|null}          queued_at
 * @property {string|null}          started_at
 * @property {string|null}          completed_at
 * @property {string|null}          failed_at
 * @property {string}               created_at
 * @property {string}               updated_at
 */

/**
 * Normalized transcript segment persisted in transcription_segments.
 *
 * @typedef {Object} TranscriptionSegmentRow
 * @property {string} id
 * @property {string} transcription_id
 * @property {string} session_id
 * @property {number} segment_index
 * @property {number} start_seconds
 * @property {number} end_seconds
 * @property {string} text
 * @property {string} speaker
 * @property {string} speaker_label
 * @property {number|null} confidence
 * @property {boolean} is_low_confidence
 * @property {Record<string,unknown>} provider_metadata
 * @property {string} created_at
 * @property {string} updated_at
 */

// ─────────────────────────────────────────────────────────────
// PROCESSING QUEUE JOB
// ─────────────────────────────────────────────────────────────

/**
 * An async processing job enqueued for worker execution.
 *
 * @typedef {Object} ProcessingQueueJob
 * @property {string}      id            - UUID primary key
 * @property {string}      session_id    - References scribe_sessions(id)
 * @property {string}      job_type      - One of JOB_TYPE enum values
 * @property {number}      priority      - 1 (low) to 10 (urgent)
 * @property {string}      status        - One of JOB_STATUS enum values
 * @property {number}      attempt_count - Incremented on each processing attempt
 * @property {number}      max_attempts  - Hard ceiling on retries
 * @property {string|null} error         - Last error message if status=failed
 * @property {Record<string,unknown>} metadata - Job-specific payload
 * @property {string}      scheduled_at  - ISO 8601; earliest time job may be processed
 * @property {string|null} started_at    - Set by worker on claim
 * @property {string|null} completed_at  - Set by worker on finish
 * @property {string}      created_at
 */

// ─────────────────────────────────────────────────────────────
// AUDIT LOG ENTRY
// ─────────────────────────────────────────────────────────────

/**
 * An immutable audit log entry.
 *
 * metadata MUST NOT contain PII (names, phone numbers, transcript text).
 * Use only IDs, status values, counts, model names, and cost figures.
 *
 * @typedef {Object} ScribeAuditLog
 * @property {string}      id          - UUID primary key
 * @property {string|null} session_id  - Session at time of action (no FK; survives deletion)
 * @property {string}      clinic_id   - References clinics(id)
 * @property {string}      doctor_id   - References auth.users(id)
 * @property {string}      actor_id    - auth.uid() at time of action
 * @property {string}      action      - One of AUDIT_ACTION enum values
 * @property {string|null} ip_address  - Client IP (INET)
 * @property {string|null} user_agent  - Client User-Agent header
 * @property {Record<string,unknown>} metadata - Action-specific context (no PII)
 * @property {string}      created_at  - ISO 8601 timestamp (immutable)
 */

// ─────────────────────────────────────────────────────────────
// SERVICE LAYER CONTEXT
// ─────────────────────────────────────────────────────────────

/**
 * Caller context passed from API routes into service methods.
 * Extracted from the authenticated Supabase session.
 *
 * @typedef {Object} RequestContext
 * @property {string} actorId     - auth.uid()
 * @property {string} doctorId    - Verified doctor user ID
 * @property {string} clinicId    - Doctor's clinic ID
 * @property {string} [ipAddress] - Client IP from request headers
 * @property {string} [userAgent] - Client User-Agent
 * @property {string} [requestId] - Correlation ID for tracing
 */

// ─────────────────────────────────────────────────────────────
// PAGINATED RESPONSE
// ─────────────────────────────────────────────────────────────

/**
 * Wrapper for paginated list responses.
 *
 * @template T
 * @typedef {Object} PaginatedResult
 * @property {T[]}   data       - Page of results
 * @property {number} total     - Total matching records across all pages
 * @property {number} page      - Current page (1-indexed)
 * @property {number} limit     - Page size
 * @property {number} totalPages
 * @property {boolean} hasMore
 */

export {}; // ensures this file is treated as an ES module
