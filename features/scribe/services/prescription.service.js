/**
 * @fileoverview PrescriptionService — generates a doctor-reviewable prescription
 * draft from an approved SOAP note and reviewed transcript.
 *
 * State machine owned here:
 *   SOAP_APPROVED → GENERATING_PRESCRIPTION → PRESCRIPTION_DRAFT_READY
 *
 * On failure:  GENERATING_PRESCRIPTION → SOAP_APPROVED  (roll back, retryable)
 *
 * Clinical safety guarantee:
 *   The Claude prompt instructs the model to EXTRACT, never INVENT.
 *   All uncertainty is flagged in the draft's warnings array.
 *   The draft status is always "draft_ready" — never auto-approved.
 *   Doctor review is mandatory before any patient use.
 */

import crypto from "node:crypto";
import {
  AUDIT_ACTION,
  PRESCRIPTION_DRAFT_STATUS,
  PRESCRIPTION_GENERATION_CONFIG,
  SESSION_STATUS,
  SOAP_NOTE_STATUS,
} from "../constants.js";
import {
  InvalidStateTransitionError,
  PrescriptionGenerationError,
  PrescriptionNotReadyError,
  PrescriptionValidationError,
  SessionNotFoundError,
  SessionValidationError,
} from "../errors.js";
import {
  GeneratePrescriptionSchema,
  PrescriptionDraftSchema,
  RetryPrescriptionGenerationSchema,
} from "../schemas.js";
import { createLogger } from "../logger.js";
import {
  buildPrescriptionPrompt,
  PRESCRIPTION_JSON_SCHEMA,
} from "./prescription-prompt.js";
import { createSOAPAIProvider } from "./ai-providers/provider-factory.js";

export class PrescriptionService {
  /**
   * @param {import("../repository/session.repository.js").SessionRepository}         sessionRepository
   * @param {import("../repository/prescription.repository.js").PrescriptionRepository} prescriptionRepository
   * @param {import("./audit.service.js").AuditService}                                auditService
   * @param {import("./ai-providers/ai-provider.js").AIProvider}                       [aiProvider]
   */
  constructor(sessionRepository, prescriptionRepository, auditService, aiProvider) {
    this._sessions       = sessionRepository;
    this._prescriptions  = prescriptionRepository;
    this._audit          = auditService;
    this._aiProvider     = aiProvider ?? createSOAPAIProvider();
    this._log            = createLogger({ component: "PrescriptionService" });
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────

  /**
   * Generates a prescription draft for a session whose SOAP note is approved.
   *
   * Idempotent: if the same input hash already produced a draft_ready draft
   * and force is false, the existing draft is returned without re-generating.
   *
   * @param {string}                 sessionId
   * @param {Record<string,unknown>} rawInput
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async generate(sessionId, rawInput, ctx) {
    const parsed = GeneratePrescriptionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const input = parsed.data;

    // ── Load generation context ────────────────────────────────────────────
    const genCtx = await this._prescriptions.getGenerationContext(sessionId);
    if (!genCtx?.session) throw new SessionNotFoundError(sessionId);

    const { session, soapNote, patient, doctor, appointment, latestTranscriptVersion } = genCtx;

    if (session.doctor_id !== ctx.doctorId || session.clinic_id !== ctx.clinicId) {
      throw new SessionNotFoundError(sessionId);
    }

    // ── Gate: SOAP note must be approved ──────────────────────────────────
    if (!soapNote) {
      throw new PrescriptionNotReadyError(
        "No SOAP note found for this session. Generate and approve the SOAP note first.",
      );
    }
    if (soapNote.status !== SOAP_NOTE_STATUS.APPROVED) {
      throw new PrescriptionNotReadyError(
        `SOAP note status is '${soapNote.status}'. Prescription generation requires an approved SOAP note.`,
      );
    }

    // ── Gate: session status ───────────────────────────────────────────────
    const allowedFromStatuses = [
      SESSION_STATUS.SOAP_APPROVED,
      SESSION_STATUS.READY_FOR_PRESCRIPTION,
      SESSION_STATUS.COMPLETED,
    ];
    if (!allowedFromStatuses.includes(session.status)) {
      throw new InvalidStateTransitionError(session.status, SESSION_STATUS.GENERATING_PRESCRIPTION);
    }

    // ── Build generation inputs and idempotency hash ────────────────────
    const generationContext = buildGenerationContext(
      soapNote, latestTranscriptVersion, patient, doctor, appointment, session,
    );
    const inputHash = hashInput(generationContext);

    if (!input.force) {
      const reusable = await this._prescriptions.findReusableDraft(sessionId, inputHash);
      if (reusable) {
        this._log.info("Returning reusable prescription draft", { sessionId, inputHash });
        return { draft: reusable, reused: true };
      }
    }

    // ── Transition to GENERATING_PRESCRIPTION ──────────────────────────
    const fromStatus = session.status;
    await this._sessions.transitionStatus(
      sessionId, ctx.doctorId, fromStatus, SESSION_STATUS.GENERATING_PRESCRIPTION,
      { error_message: null },
    );

    await this._audit.log({
      action:    AUDIT_ACTION.PRESCRIPTION_GENERATION_STARTED,
      sessionId,
      ctx,
      metadata:  {
        promptVersion: PRESCRIPTION_GENERATION_CONFIG.PROMPT_VERSION,
        soapNoteId:    soapNote.id,
        force:         input.force,
      },
    });

    const startedAt = Date.now();

    try {
      // ── Write a generating row (enables real-time status polling) ────────
      await this._prescriptions.upsertDraft({
        session_id:          sessionId,
        soap_note_id:        soapNote.id,
        clinic_id:           ctx.clinicId,
        doctor_id:           ctx.doctorId,
        patient_id:          session.patient_id ?? null,
        appointment_id:      session.appointment_id ?? null,
        status:              PRESCRIPTION_DRAFT_STATUS.GENERATING,
        draft:               {},
        provider:            this._aiProvider.name,
        model:               this._aiProvider.model,
        prompt_version:      PRESCRIPTION_GENERATION_CONFIG.PROMPT_VERSION,
        generation_metadata: {},
        input_hash:          inputHash,
        error_message:       null,
      });

      // ── Call Claude ──────────────────────────────────────────────────────
      const prompt    = buildPrescriptionPrompt(generationContext);
      const generated = await this._generateWithRetry(prompt);
      const draftObj  = parseAndValidateDraft(generated.text);
      const generatedAt = new Date().toISOString();

      // Low-confidence medications get an extra warning automatically.
      const autoWarnings = buildAutoWarnings(draftObj);
      const finalDraft   = {
        ...draftObj,
        warnings: [...new Set([...draftObj.warnings, ...autoWarnings])],
      };

      // ── Persist completed draft ──────────────────────────────────────────
      const draft = await this._prescriptions.upsertDraft({
        session_id:          sessionId,
        soap_note_id:        soapNote.id,
        clinic_id:           ctx.clinicId,
        doctor_id:           ctx.doctorId,
        patient_id:          session.patient_id ?? null,
        appointment_id:      session.appointment_id ?? null,
        status:              PRESCRIPTION_DRAFT_STATUS.DRAFT_READY,
        draft:               finalDraft,
        provider:            generated.provider,
        model:               generated.model,
        prompt_version:      PRESCRIPTION_GENERATION_CONFIG.PROMPT_VERSION,
        generation_metadata: {
          usage:       generated.usage,
          responseId:  generated.response?.id ?? null,
          latencyMs:   Date.now() - startedAt,
          attempts:    generated.attempts,
        },
        input_hash:          inputHash,
        error_message:       null,
        generated_at:        generatedAt,
      });

      // ── Create version snapshot ──────────────────────────────────────────
      const version = await this._createVersion(draft, ctx, generated);

      // ── Transition to PRESCRIPTION_DRAFT_READY ──────────────────────────
      await this._sessions.transitionStatus(
        sessionId, ctx.doctorId,
        SESSION_STATUS.GENERATING_PRESCRIPTION,
        SESSION_STATUS.PRESCRIPTION_DRAFT_READY,
        { error_message: null },
      );

      await this._audit.log({
        action:    AUDIT_ACTION.PRESCRIPTION_GENERATED,
        sessionId,
        ctx,
        metadata:  {
          draftId:       draft.id,
          versionId:     version.id,
          promptVersion: PRESCRIPTION_GENERATION_CONFIG.PROMPT_VERSION,
          latencyMs:     Date.now() - startedAt,
          medicationCount: finalDraft.medications.length,
          warningCount:    finalDraft.warnings.length,
        },
      });

      return { draft, version, reused: false };
    } catch (err) {
      return this._handleGenerationError(err, sessionId, soapNote, ctx, inputHash, fromStatus, startedAt);
    }
  }

  /**
   * Returns the current draft and versions for a session.
   *
   * @param {string} sessionId
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async getPrescription(sessionId, ctx) {
    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const draft    = await this._prescriptions.getDraftBySession(sessionId);
    const versions = await this._prescriptions.getVersions(sessionId);
    return { session, draft, versions };
  }

  /**
   * Returns the version history for a session's prescription draft.
   *
   * @param {string} sessionId
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async getVersions(sessionId, ctx) {
    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const versions = await this._prescriptions.getVersions(sessionId);
    return { session, versions };
  }

  /**
   * Re-triggers generation after a failure or when force=true.
   *
   * @param {string}                 sessionId
   * @param {Record<string,unknown>} rawInput
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async retry(sessionId, rawInput, ctx) {
    const parsed = RetryPrescriptionGenerationSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    return this.generate(sessionId, { force: true }, ctx);
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────────────────────

  /**
   * Calls Claude with exponential back-off up to MAX_ATTEMPTS.
   *
   * @param {Array<{role: string; content: string}>} prompt
   */
  async _generateWithRetry(prompt) {
    let lastError = null;
    for (let attempt = 1; attempt <= PRESCRIPTION_GENERATION_CONFIG.MAX_ATTEMPTS; attempt++) {
      try {
        const result = await this._aiProvider.generateStructuredJSON({
          input:           prompt,
          jsonSchema:      PRESCRIPTION_JSON_SCHEMA,
          temperature:     PRESCRIPTION_GENERATION_CONFIG.TEMPERATURE,
          maxOutputTokens: PRESCRIPTION_GENERATION_CONFIG.MAX_OUTPUT_TOKENS,
        });
        return { ...result, attempts: attempt };
      } catch (err) {
        lastError = err;
        this._log.warn("Prescription generation attempt failed", {
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });
        if (attempt < PRESCRIPTION_GENERATION_CONFIG.MAX_ATTEMPTS) {
          await sleep(600 * attempt);
        }
      }
    }
    throw lastError ?? new PrescriptionGenerationError("Prescription generation failed after all attempts");
  }

  /**
   * @param {Record<string,unknown>} draft
   * @param {import("../models/session.model.js").RequestContext} ctx
   * @param {Record<string,unknown>} generated
   */
  async _createVersion(draft, ctx, generated) {
    const versionNumber = await this._prescriptions.getNextVersionNumber(draft.id);
    const version = await this._prescriptions.createVersion({
      prescription_draft_id: draft.id,
      session_id:            draft.session_id,
      soap_note_id:          draft.soap_note_id,
      clinic_id:             ctx.clinicId,
      doctor_id:             ctx.doctorId,
      version_number:        versionNumber,
      draft:                 draft.draft,
      provider:              draft.provider,
      model:                 draft.model,
      prompt_version:        draft.prompt_version,
      input_hash:            draft.input_hash,
      generation_metadata:   draft.generation_metadata,
      created_by:            ctx.actorId,
    });

    await this._audit.log({
      action:    AUDIT_ACTION.PRESCRIPTION_VERSION_CREATED,
      sessionId: draft.session_id,
      ctx,
      metadata:  {
        draftId:       draft.id,
        versionId:     version.id,
        versionNumber,
        responseId:    generated.response?.id ?? null,
      },
    });

    return version;
  }

  /**
   * @param {unknown}                err
   * @param {string}                 sessionId
   * @param {Record<string,unknown>} soapNote
   * @param {import("../models/session.model.js").RequestContext} ctx
   * @param {string}                 inputHash
   * @param {string}                 fromStatus
   * @param {number}                 startedAt
   */
  async _handleGenerationError(err, sessionId, soapNote, ctx, inputHash, fromStatus, startedAt) {
    const message = err instanceof Error ? err.message : String(err);

    this._log.error("Prescription generation failed", { sessionId, error: message });

    await this._prescriptions.upsertDraft({
      session_id:          sessionId,
      soap_note_id:        soapNote?.id ?? null,
      clinic_id:           ctx.clinicId,
      doctor_id:           ctx.doctorId,
      patient_id:          null,
      appointment_id:      null,
      status:              PRESCRIPTION_DRAFT_STATUS.FAILED,
      draft:               {},
      provider:            this._aiProvider.name,
      model:               this._aiProvider.model,
      prompt_version:      PRESCRIPTION_GENERATION_CONFIG.PROMPT_VERSION,
      generation_metadata: { latencyMs: Date.now() - startedAt },
      input_hash:          inputHash,
      error_message:       message,
    });

    // Roll session back to SOAP_APPROVED so the doctor can retry
    const current = await this._sessions.findById(sessionId, ctx.doctorId);
    if (current?.status === SESSION_STATUS.GENERATING_PRESCRIPTION) {
      await this._sessions.transitionStatus(
        sessionId, ctx.doctorId,
        SESSION_STATUS.GENERATING_PRESCRIPTION,
        SESSION_STATUS.SOAP_APPROVED,
        { error_message: message },
      );
    }

    await this._audit.log({
      action:    AUDIT_ACTION.PRESCRIPTION_GENERATION_FAILED,
      sessionId,
      ctx,
      metadata:  { error: message, promptVersion: PRESCRIPTION_GENERATION_CONFIG.PROMPT_VERSION },
    });

    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE-LEVEL HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Assembles the typed generation context passed to the prompt builder.
 *
 * @param {Record<string,unknown>}      soapNote
 * @param {Record<string,unknown>|null} transcriptVersion
 * @param {Record<string,unknown>|null} patient
 * @param {Record<string,unknown>|null} doctor
 * @param {Record<string,unknown>|null} appointment
 * @param {Record<string,unknown>}      session
 * @returns {import('./prescription-prompt.js').PrescriptionGenerationContext}
 */
function buildGenerationContext(soapNote, transcriptVersion, patient, doctor, appointment, session) {
  const transcriptText = transcriptVersion?.full_text?.trim() ?? "";

  return {
    soapNote: {
      chiefComplaint:          soapNote.chief_complaint ?? "",
      historyOfPresentIllness: soapNote.history_of_present_illness ?? "",
      subjective:              soapNote.subjective ?? "",
      objective:               soapNote.objective  ?? "",
      assessment:              soapNote.assessment ?? "",
      plan:                    soapNote.plan       ?? "",
      clinicalSummary:         soapNote.clinical_summary ?? "",
    },
    transcriptText,
    patient: patient
      ? {
          age:             patient.age    ?? null,
          gender:          patient.gender ?? null,
          knownConditions: patient.condition ?? null,
        }
      : null,
    doctor: doctor
      ? {
          fullName:       doctor.full_name      ?? null,
          specialization: doctor.specialization ?? null,
          clinicName:     doctor.clinic_name    ?? null,
        }
      : null,
    consultation: {
      language:  session.language ?? null,
      sessionId: session.id,
    },
  };
}

/**
 * Parses the raw JSON string returned by the AI and validates it against
 * PrescriptionDraftSchema. Throws PrescriptionValidationError on failure.
 *
 * @param {string} text
 * @returns {import('../schemas.js').PrescriptionDraft}
 */
function parseAndValidateDraft(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new PrescriptionValidationError({ reason: "invalid_json", message: err.message });
  }

  const result = PrescriptionDraftSchema.safeParse(parsed);
  if (!result.success) {
    throw new PrescriptionValidationError(result.error.flatten());
  }
  return result.data;
}

/**
 * Generates automatic warnings for medications that have low confidence or
 * missing required fields. These supplement whatever Claude already flagged.
 *
 * @param {import('../schemas.js').PrescriptionDraft} draft
 * @returns {string[]}
 */
function buildAutoWarnings(draft) {
  const warnings = [];
  for (const med of draft.medications) {
    if (med.confidence < PRESCRIPTION_GENERATION_CONFIG.LOW_CONFIDENCE_THRESHOLD) {
      warnings.push(
        `Low confidence (${(med.confidence * 100).toFixed(0)}%) for medication "${med.name}": verify dosage and instructions before prescribing.`,
      );
    }
    if (med.dosage === "Not specified") {
      warnings.push(`Dosage not specified for "${med.name}". Doctor must confirm dosage before prescribing.`);
    }
    if (med.frequency === "Not specified") {
      warnings.push(`Frequency not specified for "${med.name}". Doctor must confirm frequency before prescribing.`);
    }
  }
  return warnings;
}

/** @param {unknown} value */
function hashInput(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
