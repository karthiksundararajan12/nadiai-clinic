/**
 * @fileoverview Zod validation schemas for the AI Scribe Recording Domain.
 *
 * All schemas are exported individually and re-exported from features/scribe/index.js.
 * Parse with .safeParse() to get typed results without throwing.
 */

import { z } from "zod";
import { SESSION_STATUS, SCRIBE_LANGUAGE, SCRIBE_LIMITS } from "./constants.js";

// ─────────────────────────────────────────────────────────────
// REUSABLE PRIMITIVES
// ─────────────────────────────────────────────────────────────

const uuid = z
  .string({ required_error: "UUID is required" })
  .uuid("Must be a valid UUID");

const uuidOptional = z.string().uuid("Must be a valid UUID").optional().nullable();

const statusEnum = z.enum(
  /** @type {[string, ...string[]]} */ (Object.values(SESSION_STATUS)),
  { errorMap: () => ({ message: "Invalid session status" }) },
);

const languageEnum = z.enum(
  /** @type {[string, ...string[]]} */ (Object.values(SCRIBE_LANGUAGE)),
  { errorMap: () => ({ message: `Language must be one of: ${Object.values(SCRIBE_LANGUAGE).join(", ")}` }) },
);

const speakerLabel = z.enum(["Doctor", "Patient", "Attendant"]);
const speakerKey   = z.enum(["A", "B", "C"]);

// ─────────────────────────────────────────────────────────────
// TRANSCRIPT SEGMENT
// Used for edited_transcript and low_confidence_segments.
// ─────────────────────────────────────────────────────────────

export const TranscriptSegmentSchema = z.object({
  id:            z.string().min(1),
  start:         z.number().nonnegative("Start time cannot be negative"),
  end:           z.number().positive("End time must be positive"),
  text:          z.string().max(10_000),
  speaker:       speakerKey,
  speaker_label: speakerLabel,
  confidence:    z.number().min(0).max(1),
  edited:        z.boolean().optional().default(false),
}).refine((s) => s.end > s.start, {
  message: "Segment end time must be after start time",
  path:    ["end"],
});

// ─────────────────────────────────────────────────────────────
// CREATE SESSION
// POST /api/scribe/sessions
// ─────────────────────────────────────────────────────────────

export const CreateSessionSchema = z.object({
  patient_id:     uuidOptional,
  appointment_id: uuidOptional,
  language:       languageEnum.default(SCRIBE_LANGUAGE.HINGLISH),
});

/** @typedef {z.infer<typeof CreateSessionSchema>} CreateSessionInput */

// ─────────────────────────────────────────────────────────────
// UPDATE SESSION (data fields only — no status here)
// PATCH /api/scribe/sessions/:id  { action: "update", ... }
// ─────────────────────────────────────────────────────────────

export const UpdateSessionSchema = z
  .object({
    patient_id:          uuidOptional,
    appointment_id:      uuidOptional,
    language:            languageEnum.optional(),
    edited_transcript:   z.array(TranscriptSegmentSchema).optional(),
    speaker_corrections: z
      .record(speakerKey, speakerLabel)
      .optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided for update",
  });

/** @typedef {z.infer<typeof UpdateSessionSchema>} UpdateSessionInput */

// ─────────────────────────────────────────────────────────────
// STATE TRANSITION
// PATCH /api/scribe/sessions/:id  { action: "transition", to_status: "..." }
// ─────────────────────────────────────────────────────────────

export const TransitionStateSchema = z.object({
  to_status: statusEnum,
  reason:    z.string().max(500).optional(),
  metadata:  z.record(z.unknown()).optional().default({}),
});

/** @typedef {z.infer<typeof TransitionStateSchema>} TransitionStateInput */

// ─────────────────────────────────────────────────────────────
// FINALIZE UPLOAD
// PATCH /api/scribe/sessions/:id  { action: "finalize", ... }
// Called when the last audio chunk has been confirmed.
// Transitions the session from UPLOADING → UPLOADED.
// ─────────────────────────────────────────────────────────────

export const FinalizeSessionSchema = z.object({
  total_chunks:            z.number().int().positive("Must have at least one chunk"),
  audio_duration_seconds:  z
    .number()
    .nonnegative("Duration cannot be negative")
    .max(7200, "Recording cannot exceed 2 hours"),
  audio_size_bytes:        z
    .number()
    .int()
    .positive("File size must be positive")
    .max(200 * 1024 * 1024, "Audio exceeds 200 MB limit"),
});

/** @typedef {z.infer<typeof FinalizeSessionSchema>} FinalizeSessionInput */

// ─────────────────────────────────────────────────────────────
// AUDIO CHUNK REGISTRATION
// POST /api/scribe/sessions/:id/chunks
// ─────────────────────────────────────────────────────────────

export const RegisterChunkSchema = z.object({
  chunk_index:  z.number().int().nonnegative(),
  storage_path: z.string().min(1).max(1024),
  size_bytes:   z.number().int().positive(),
  duration_ms:  z.number().int().nonnegative(),
  checksum:     z.string().max(128).optional().nullable(),
});

/** @typedef {z.infer<typeof RegisterChunkSchema>} RegisterChunkInput */

// ─────────────────────────────────────────────────────────────
// AUDIO UPLOAD SESSION
// POST /api/scribe/uploads/start
// Called after recording stops. Creates a scribe session, moves it to
// UPLOADING, pre-registers chunks, and returns signed upload URLs.
// ─────────────────────────────────────────────────────────────

const audioMimeType = z
  .string()
  .min(1)
  .max(100)
  .refine((v) => v.startsWith("audio/"), {
    message: "mime_type must be an audio MIME type",
  });

const chunkChecksum = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[a-zA-Z0-9+/=_-]+$/, "checksum must be base64/base64url/hex-safe")
  .optional()
  .nullable();

export const UploadChunkManifestSchema = z.object({
  chunk_index: z.number().int().nonnegative(),
  size_bytes:  z.number().int().positive().max(SCRIBE_LIMITS.MAX_AUDIO_SIZE_BYTES),
  duration_ms: z.number().int().nonnegative().max(SCRIBE_LIMITS.MAX_RECORDING_SECONDS * 1000),
  mime_type:   audioMimeType,
  checksum:    chunkChecksum,
});

export const StartAudioUploadSchema = z.object({
  patient_id:             uuidOptional,
  appointment_id:         uuidOptional,
  language:               languageEnum.default(SCRIBE_LANGUAGE.HINGLISH),
  audio_duration_seconds: z
    .number()
    .nonnegative()
    .max(SCRIBE_LIMITS.MAX_RECORDING_SECONDS, "Recording exceeds 90-minute limit"),
  audio_size_bytes:       z
    .number()
    .int()
    .positive()
    .max(SCRIBE_LIMITS.MAX_AUDIO_SIZE_BYTES, "Audio exceeds 200 MB limit"),
  chunks: z
    .array(UploadChunkManifestSchema)
    .min(1, "At least one audio chunk is required")
    .max(500, "Too many chunks in a single recording"),
}).superRefine((input, ctx) => {
  const seen = new Set();
  let totalSize = 0;
  let totalDurationMs = 0;

  for (const chunk of input.chunks) {
    if (seen.has(chunk.chunk_index)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chunks"],
        message: `Duplicate chunk_index ${chunk.chunk_index}`,
      });
    }
    seen.add(chunk.chunk_index);
    totalSize += chunk.size_bytes;
    totalDurationMs += chunk.duration_ms;
  }

  const expectedIndexes = [...seen].sort((a, b) => a - b);
  expectedIndexes.forEach((idx, pos) => {
    if (idx !== pos) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chunks"],
        message: "Chunk indexes must be contiguous and start at 0",
      });
    }
  });

  if (totalSize !== input.audio_size_bytes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["audio_size_bytes"],
      message: "audio_size_bytes must equal the sum of chunk sizes",
    });
  }

  const declaredDurationMs = Math.round(input.audio_duration_seconds * 1000);
  const delta = Math.abs(totalDurationMs - declaredDurationMs);
  if (delta > 5000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["audio_duration_seconds"],
      message: "audio_duration_seconds must approximately equal the sum of chunk durations",
    });
  }
});

/** @typedef {z.infer<typeof StartAudioUploadSchema>} StartAudioUploadInput */

export const ConfirmAudioChunkSchema = z.object({
  chunk_index: z.number().int().nonnegative(),
  size_bytes:  z.number().int().positive().max(SCRIBE_LIMITS.MAX_AUDIO_SIZE_BYTES),
  checksum:    chunkChecksum,
});

/** @typedef {z.infer<typeof ConfirmAudioChunkSchema>} ConfirmAudioChunkInput */

export const RetryAudioUploadSchema = z.object({
  chunk_indexes: z
    .array(z.number().int().nonnegative())
    .min(1)
    .max(100)
    .optional(),
});

/** @typedef {z.infer<typeof RetryAudioUploadSchema>} RetryAudioUploadInput */

export const FinalizeAudioUploadSchema = z.object({
  audio_duration_seconds: z
    .number()
    .nonnegative()
    .max(SCRIBE_LIMITS.MAX_RECORDING_SECONDS, "Recording exceeds 90-minute limit"),
  audio_size_bytes: z
    .number()
    .int()
    .positive()
    .max(SCRIBE_LIMITS.MAX_AUDIO_SIZE_BYTES, "Audio exceeds 200 MB limit"),
});

/** @typedef {z.infer<typeof FinalizeAudioUploadSchema>} FinalizeAudioUploadInput */

// ─────────────────────────────────────────────────────────────
// TRANSCRIPTION PIPELINE
// ─────────────────────────────────────────────────────────────

export const QueueTranscriptionSchema = z.object({
  priority: z.coerce.number().int().min(1).max(10).default(5),
  force: z.boolean().optional().default(false),
});

/** @typedef {z.infer<typeof QueueTranscriptionSchema>} QueueTranscriptionInput */

export const RetryTranscriptionSchema = z.object({
  reason: z.string().max(500).optional(),
  force: z.boolean().optional().default(false),
});

/** @typedef {z.infer<typeof RetryTranscriptionSchema>} RetryTranscriptionInput */

export const TranscriptionWorkerSchema = z.object({
  batch_size: z.coerce.number().int().min(1).max(5).default(1),
  worker_id: z.string().min(1).max(100).optional(),
});

/** @typedef {z.infer<typeof TranscriptionWorkerSchema>} TranscriptionWorkerInput */

export const RecoverTranscriptionJobsSchema = z.object({
  stale_minutes: z.coerce.number().int().min(5).max(180).default(15),
});

/** @typedef {z.infer<typeof RecoverTranscriptionJobsSchema>} RecoverTranscriptionJobsInput */

// ─────────────────────────────────────────────────────────────
// TRANSCRIPT REVIEW WORKSPACE
// ─────────────────────────────────────────────────────────────

export const ReviewSegmentUpdateSchema = z.object({
  text: z.string().min(1).max(20_000).optional(),
  speaker: z.enum(["A", "B", "C", "U"]).optional(),
  speaker_label: z.enum(["Doctor", "Patient", "Attendant", "Unknown"]).optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: "At least one segment field must be changed",
});

/** @typedef {z.infer<typeof ReviewSegmentUpdateSchema>} ReviewSegmentUpdateInput */

export const SaveTranscriptVersionSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  source: z.enum(["manual_save", "auto_save", "review_completed", "version_restore"]).default("manual_save"),
});

/** @typedef {z.infer<typeof SaveTranscriptVersionSchema>} SaveTranscriptVersionInput */

export const RestoreTranscriptVersionSchema = z.object({
  version_id: uuid,
});

/** @typedef {z.infer<typeof RestoreTranscriptVersionSchema>} RestoreTranscriptVersionInput */

export const CompleteReviewSchema = z.object({
  create_version: z.boolean().optional().default(true),
});

/** @typedef {z.infer<typeof CompleteReviewSchema>} CompleteReviewInput */

// ─────────────────────────────────────────────────────────────
// SOAP NOTE GENERATION
// ─────────────────────────────────────────────────────────────

const soapField = z
  .string()
  .trim()
  .min(1, "SOAP fields must not be empty")
  .max(6000, "SOAP fields must be concise");

export const SOAPNoteSchema = z.object({
  subjective: soapField,
  objective: soapField,
  assessment: soapField,
  plan: soapField,
  chiefComplaint: soapField,
  historyOfPresentIllness: soapField,
  clinicalSummary: soapField,
}).strict();

/** @typedef {z.infer<typeof SOAPNoteSchema>} SOAPNote */

export const GenerateSOAPNoteSchema = z.object({
  force: z.boolean().optional().default(false),
  transcript_version_id: uuidOptional,
});

/** @typedef {z.infer<typeof GenerateSOAPNoteSchema>} GenerateSOAPNoteInput */

export const RetrySOAPGenerationSchema = z.object({
  reason: z.string().max(500).optional(),
  force: z.boolean().optional().default(true),
});

/** @typedef {z.infer<typeof RetrySOAPGenerationSchema>} RetrySOAPGenerationInput */

export const SOAPSectionKeySchema = z.enum([
  "chiefComplaint",
  "historyOfPresentIllness",
  "subjective",
  "objective",
  "assessment",
  "plan",
  "clinicalSummary",
]);

/** Section updates allow empty strings while the doctor is still editing. */
const soapSectionUpdateValue = z.string().trim().max(6000);

export const UpdateSOAPSectionSchema = z.object({
  section_key: SOAPSectionKeySchema,
  value: soapSectionUpdateValue,
  source: z.enum(["autosave", "manual"]).optional().default("manual"),
});

/** @typedef {z.infer<typeof UpdateSOAPSectionSchema>} UpdateSOAPSectionInput */

export const SaveSOAPVersionSchema = z.object({
  source: z.enum(["autosave", "manual_save", "doctor_edited"]).default("manual_save"),
  label: z.string().min(1).max(120).optional(),
});

/** @typedef {z.infer<typeof SaveSOAPVersionSchema>} SaveSOAPVersionInput */

export const CompareSOAPVersionsSchema = z.object({
  from_version_id: uuid,
  to_version_id: uuid,
});

/** @typedef {z.infer<typeof CompareSOAPVersionsSchema>} CompareSOAPVersionsInput */

export const ApproveSOAPNoteSchema = z.object({
  create_version: z.boolean().optional().default(true),
});

/** @typedef {z.infer<typeof ApproveSOAPNoteSchema>} ApproveSOAPNoteInput */

export const RejectSOAPNoteSchema = z.object({
  reason: z.string().min(1).max(1000).optional(),
  action: z.enum(["regenerated", "manual_edit", "rejected"]).optional(),
});

/** @typedef {z.infer<typeof RejectSOAPNoteSchema>} RejectSOAPNoteInput */

export const SaveDoctorSOAPEditsSchema = z.object({
  subjective: z.string().max(6000).optional(),
  objective: z.string().max(6000).optional(),
  assessment: z.string().max(6000).optional(),
  plan: z.string().max(6000).optional(),
  chiefComplaint: z.string().max(6000).optional(),
  historyOfPresentIllness: z.string().max(6000).optional(),
  clinicalSummary: z.string().max(6000).optional(),
});

/** @typedef {z.infer<typeof SaveDoctorSOAPEditsSchema>} SaveDoctorSOAPEditsInput */

export const SubmitSOAPReviewFeedbackSchema = z.object({
  review_action: z.enum(["regenerated", "manual_edit", "rejected"]),
  feedback_reasons: z.array(z.enum([
    "missing_information",
    "incorrect_symptoms",
    "incorrect_diagnosis",
    "incorrect_assessment",
    "incorrect_plan",
    "too_short",
    "too_detailed",
    "formatting_issues",
    "hallucinated_information",
    "other",
  ])).optional().default([]),
  other_reason: z.string().max(1000).optional(),
  soap_version_id: z.string().uuid().optional(),
});

/** @typedef {z.infer<typeof SubmitSOAPReviewFeedbackSchema>} SubmitSOAPReviewFeedbackInput */

export const RestoreSOAPVersionSchema = z.object({
  version_id: uuid,
});

/** @typedef {z.infer<typeof RestoreSOAPVersionSchema>} RestoreSOAPVersionInput */

// ─────────────────────────────────────────────────────────────
// PRESCRIPTION DRAFT GENERATION
// ─────────────────────────────────────────────────────────────

export const PrescriptionMedicationSchema = z.object({
  name:         z.string().min(1).max(200),
  dosage:       z.string().min(1).max(200),
  frequency:    z.string().min(1).max(200),
  duration:     z.string().min(1).max(200),
  instructions: z.string().max(1000).default(""),
  confidence:   z.number().min(0).max(1),
});

/** @typedef {z.infer<typeof PrescriptionMedicationSchema>} PrescriptionMedication */

/**
 * Output schema for the AI-generated prescription draft.
 * Matches exactly what Claude returns via the tool-use call.
 */
export const PrescriptionDraftSchema = z.object({
  diagnosis:            z.array(z.string().min(1).max(500)).min(0),
  medications:          z.array(PrescriptionMedicationSchema),
  investigations:       z.array(z.string().min(1).max(500)),
  advice:               z.array(z.string().min(1).max(1000)),
  followUpInstructions: z.string().max(2000).default(""),
  warnings:             z.array(z.string().min(1).max(1000)),
}).strict();

/** @typedef {z.infer<typeof PrescriptionDraftSchema>} PrescriptionDraft */

export const GeneratePrescriptionSchema = z.object({
  force:           z.boolean().optional().default(false),
  soap_note_id:    z.string().uuid().optional().nullable(),
});

/** @typedef {z.infer<typeof GeneratePrescriptionSchema>} GeneratePrescriptionInput */

export const RetryPrescriptionGenerationSchema = z.object({
  reason: z.string().max(500).optional(),
  force:  z.boolean().optional().default(true),
});

/** @typedef {z.infer<typeof RetryPrescriptionGenerationSchema>} RetryPrescriptionGenerationInput */

export const UpdatePrescriptionDraftSchema = z.object({
  draft:  PrescriptionDraftSchema,
  source: z.enum(["autosave", "manual_edit"]).default("autosave"),
});

/** @typedef {z.infer<typeof UpdatePrescriptionDraftSchema>} UpdatePrescriptionDraftInput */

export const SavePrescriptionVersionSchema = z.object({
  source: z.enum(["autosave", "manual_save"]).default("manual_save"),
  label:  z.string().min(1).max(120).optional(),
});

/** @typedef {z.infer<typeof SavePrescriptionVersionSchema>} SavePrescriptionVersionInput */

export const ApprovePrescriptionSchema = z.object({
  create_version: z.boolean().optional().default(true),
});

/** @typedef {z.infer<typeof ApprovePrescriptionSchema>} ApprovePrescriptionInput */

export const RejectPrescriptionSchema = z.object({
  reason:      z.string().min(1).max(1000),
  regenerate:  z.boolean().optional().default(false),
});

/** @typedef {z.infer<typeof RejectPrescriptionSchema>} RejectPrescriptionInput */

// ─────────────────────────────────────────────────────────────
// SESSION FILTER (list endpoint)
// GET /api/scribe/sessions?status=UPLOADED&page=2
// ─────────────────────────────────────────────────────────────

export const SessionFilterSchema = z.object({
  patient_id:  uuidOptional,
  status:      z
    .union([statusEnum, z.array(statusEnum)])
    .optional()
    .transform((v) => {
      if (v == null) return undefined;
      return Array.isArray(v) ? v : [v];
    }),
  language:    languageEnum.optional(),
  date_from:   z.string().datetime({ message: "date_from must be ISO 8601" }).optional(),
  date_to:     z.string().datetime({ message: "date_to must be ISO 8601" }).optional(),
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().min(1).max(100).default(20),
  sort_by:     z
    .enum(["created_at", "updated_at", "status"])
    .default("created_at"),
  sort_order:  z.enum(["asc", "desc"]).default("desc"),
}).refine(
  (d) => {
    if (d.date_from && d.date_to) {
      return new Date(d.date_from) <= new Date(d.date_to);
    }
    return true;
  },
  { message: "date_from must be before date_to", path: ["date_from"] },
);

/** @typedef {z.infer<typeof SessionFilterSchema>} SessionFilterInput */

// ─────────────────────────────────────────────────────────────
// PATCH DISPATCHER
// Discriminated union for the PATCH /api/scribe/sessions/:id body.
// The "action" field drives which sub-schema is applied.
// ─────────────────────────────────────────────────────────────

export const PatchSessionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"),     ...UpdateSessionSchema.shape }),
  z.object({ action: z.literal("transition"), ...TransitionStateSchema.shape }),
  z.object({ action: z.literal("finalize"),   ...FinalizeSessionSchema.shape }),
]);

/** @typedef {z.infer<typeof PatchSessionSchema>} PatchSessionInput */
