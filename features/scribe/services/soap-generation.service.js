/**
 * @fileoverview SOAPGenerationService — structured clinical note generation
 * from doctor-reviewed transcripts.
 */

import crypto from "node:crypto";
import {
  AUDIT_ACTION,
  SOAP_GENERATION_CONFIG,
  SOAP_NOTE_STATUS,
  SESSION_STATUS,
} from "../constants.js";
import {
  InvalidStateTransitionError,
  SOAPGenerationError,
  SOAPNotReadyError,
  SOAPValidationError,
  SessionNotFoundError,
  SessionValidationError,
} from "../errors.js";
import {
  GenerateSOAPNoteSchema,
  RetrySOAPGenerationSchema,
  SOAPNoteSchema,
} from "../schemas.js";
import { createLogger } from "../logger.js";
import { buildSOAPPrompt, SOAP_JSON_SCHEMA } from "./soap-prompt.js";
import { createSOAPAIProvider } from "./ai-providers/provider-factory.js";
import {
  toDbSoapNoteStatus,
  toDbSoapVersionSource,
  withSoapWorkflowMetadata,
} from "../lib/soap-db-compat.js";

export class SOAPGenerationService {
  /**
   * @param {import("../repository/session.repository.js").SessionRepository} sessionRepository
   * @param {import("../repository/soap.repository.js").SOAPRepository} soapRepository
   * @param {import("./audit.service.js").AuditService} auditService
   * @param {import("./ai-providers/ai-provider.js").AIProvider} [aiProvider]
   */
  constructor(sessionRepository, soapRepository, auditService, aiProvider) {
    this._sessions = sessionRepository;
    this._soap = soapRepository;
    this._audit = auditService;
    this._aiProvider = aiProvider ?? createSOAPAIProvider();
    this._log = createLogger({ component: "SOAPGenerationService" });
  }

  /** @param {string} sessionId @param {import("../models/session.model.js").RequestContext} ctx */
  async getSOAP(sessionId, ctx) {
    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const note = await this._soap.getNoteBySession(sessionId);
    const versions = await this._soap.getVersions(sessionId);
    return { session, note, versions };
  }

  /**
   * @param {string} sessionId
   * @param {Record<string, unknown>} rawInput
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async generate(sessionId, rawInput, ctx) {
    const parsed = GenerateSOAPNoteSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const input = parsed.data;

    const context = await this._soap.getGenerationContext(sessionId);
    if (!context?.session) throw new SessionNotFoundError(sessionId);
    if (context.session.doctor_id !== ctx.doctorId || context.session.clinic_id !== ctx.clinicId) {
      throw new SessionNotFoundError(sessionId);
    }

    if (
      context.session.status !== SESSION_STATUS.REVIEW_COMPLETED &&
      context.session.status !== SESSION_STATUS.SOAP_REVIEW_REQUIRED &&
      context.session.status !== SESSION_STATUS.SOAP_REVIEWING &&
      context.session.status !== SESSION_STATUS.SOAP_READY
    ) {
      throw new InvalidStateTransitionError(context.session.status, SESSION_STATUS.GENERATING_SOAP);
    }

    const transcriptVersion = input.transcript_version_id
      ? await this._soap.getTranscriptVersion(input.transcript_version_id)
      : context.latestTranscriptVersion;

    if (!transcriptVersion || transcriptVersion.session_id !== sessionId) {
      throw new SOAPNotReadyError("A reviewed transcript version is required before SOAP generation");
    }

    const generationContext = buildGenerationContext(context, transcriptVersion);
    const inputHash = hashInput(generationContext);

    if (!input.force) {
      const reusable = await this._soap.findReusableNote(sessionId, inputHash);
      if (
        reusable &&
        (!transcriptVersion?.id || reusable.transcript_version_id === transcriptVersion.id)
      ) {
        return { note: reusable, reused: true };
      }
    }

    const existingNote = await this._soap.getNoteBySession(sessionId);
    let archivedVersion = null;
    if (input.force && existingNote?.note && Object.keys(existingNote.note).length > 0) {
      const versions = await this._soap.getVersions(sessionId);
      const latest = versions?.[0];
      const differsFromLatest =
        !latest ||
        JSON.stringify(latest.note ?? {}) !== JSON.stringify(existingNote.note ?? {});
      if (differsFromLatest) {
        archivedVersion = await this._archiveNoteBeforeRegeneration(existingNote, ctx);
      }
    }

    const recoveryStatus = context.session.status === SESSION_STATUS.SOAP_READY
      ? SESSION_STATUS.SOAP_REVIEW_REQUIRED
      : context.session.status;
    await this._transitionToGenerating(context.session, ctx);

    const startedAt = Date.now();
    if (input.force) {
      await this._audit.log({
        action: AUDIT_ACTION.SOAP_REGENERATED,
        sessionId,
        ctx,
        metadata: { transcriptVersionId: transcriptVersion.id },
      });
    }
    await this._audit.log({
      action: AUDIT_ACTION.SOAP_GENERATION_STARTED,
      sessionId,
      ctx,
      metadata: {
        promptVersion: SOAP_GENERATION_CONFIG.PROMPT_VERSION,
        transcriptVersionId: transcriptVersion.id,
        force: Boolean(input.force),
      },
    });

    try {
      const prompt = buildSOAPPrompt(generationContext);
      const generated = await this._generateWithRetry(prompt);
      const noteObject = parseAndValidateSOAP(generated.text);
      const generatedAt = new Date().toISOString();

      const workflowAction = input.force ? "regenerated" : "generated";
      const noteStatus = toDbSoapNoteStatus(workflowAction);

      const note = await this._soap.upsertNote({
        session_id: sessionId,
        transcript_version_id: transcriptVersion.id,
        clinic_id: ctx.clinicId,
        doctor_id: ctx.doctorId,
        patient_id: context.session.patient_id,
        appointment_id: context.session.appointment_id,
        status: noteStatus,
        note: noteObject,
        original_note: existingNote?.original_note ?? existingNote?.note ?? noteObject,
        subjective: noteObject.subjective,
        objective: noteObject.objective,
        assessment: noteObject.assessment,
        plan: noteObject.plan,
        chief_complaint: noteObject.chiefComplaint,
        history_of_present_illness: noteObject.historyOfPresentIllness,
        clinical_summary: noteObject.clinicalSummary,
        provider: generated.provider,
        model: generated.model,
        prompt_version: SOAP_GENERATION_CONFIG.PROMPT_VERSION,
        generation_metadata: withSoapWorkflowMetadata({
          usage: generated.usage,
          responseId: generated.response?.id ?? null,
          latencyMs: Date.now() - startedAt,
          attempts: generated.attempts,
        }, workflowAction),
        input_hash: inputHash,
        error_message: null,
        generated_at: generatedAt,
      });

      const versionSource = toDbSoapVersionSource(input.force ? "regenerated" : "ai_generated");
      const version = await this._createVersion(
        note,
        transcriptVersion,
        ctx,
        generated,
        versionSource,
        input.force ? "Regenerated" : "Original",
      );

      await this._sessions.transitionStatus(
        sessionId,
        ctx.doctorId,
        SESSION_STATUS.GENERATING_SOAP,
        SESSION_STATUS.SOAP_READY,
        { error_message: null },
      );
      const latest = await this._sessions.findById(sessionId, ctx.doctorId);
      if (latest?.status === SESSION_STATUS.SOAP_READY) {
        await this._sessions.transitionStatus(
          sessionId,
          ctx.doctorId,
          SESSION_STATUS.SOAP_READY,
          SESSION_STATUS.SOAP_REVIEW_REQUIRED,
        );
      }

      await this._audit.log({
        action: AUDIT_ACTION.SOAP_GENERATED,
        sessionId,
        ctx,
        metadata: {
          soapNoteId: note.id,
          versionId: version.id,
          promptVersion: SOAP_GENERATION_CONFIG.PROMPT_VERSION,
          latencyMs: Date.now() - startedAt,
        },
      });

      return { note, version, archivedVersion, reused: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this._soap.upsertNote({
        session_id: sessionId,
        transcript_version_id: transcriptVersion.id,
        clinic_id: ctx.clinicId,
        doctor_id: ctx.doctorId,
        patient_id: context.session.patient_id,
        appointment_id: context.session.appointment_id,
        status: SOAP_NOTE_STATUS.FAILED,
        note: {},
        provider: this._aiProvider.name,
        model: this._aiProvider.model,
        prompt_version: SOAP_GENERATION_CONFIG.PROMPT_VERSION,
        generation_metadata: { latencyMs: Date.now() - startedAt },
        input_hash: inputHash,
        error_message: message,
      });

      const current = await this._sessions.findById(sessionId, ctx.doctorId);
      if (current?.status === SESSION_STATUS.GENERATING_SOAP) {
        await this._sessions.transitionStatus(
          sessionId,
          ctx.doctorId,
          SESSION_STATUS.GENERATING_SOAP,
          recoveryStatus,
          { error_message: message },
        );
      }

      await this._audit.log({
        action: AUDIT_ACTION.SOAP_GENERATION_FAILED,
        sessionId,
        ctx,
        metadata: { promptVersion: SOAP_GENERATION_CONFIG.PROMPT_VERSION },
      });

      throw err;
    }
  }

  /** @param {string} sessionId @param {Record<string, unknown>} rawInput @param {import("../models/session.model.js").RequestContext} ctx */
  async retry(sessionId, rawInput, ctx) {
    const parsed = RetrySOAPGenerationSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    return this.generate(sessionId, { force: true }, ctx);
  }

  async _transitionToGenerating(session, ctx) {
    const from = session.status;
    await this._sessions.transitionStatus(
      session.id,
      ctx.doctorId,
      from,
      SESSION_STATUS.GENERATING_SOAP,
      { error_message: null },
    );
  }

  async _generateWithRetry(prompt) {
    let lastError = null;
    for (let attempt = 1; attempt <= SOAP_GENERATION_CONFIG.MAX_ATTEMPTS; attempt++) {
      try {
        const generated = await this._aiProvider.generateStructuredJSON({
          input: prompt,
          jsonSchema: SOAP_JSON_SCHEMA,
          temperature: SOAP_GENERATION_CONFIG.TEMPERATURE,
          maxOutputTokens: SOAP_GENERATION_CONFIG.MAX_OUTPUT_TOKENS,
        });
        return { ...generated, attempts: attempt };
      } catch (err) {
        lastError = err;
        if (attempt < SOAP_GENERATION_CONFIG.MAX_ATTEMPTS) {
          await sleep(500 * attempt);
        }
      }
    }
    throw lastError ?? new SOAPGenerationError("SOAP generation failed");
  }

  async _archiveNoteBeforeRegeneration(note, ctx) {
    const versionNumber = await this._soap.getNextVersionNumber(note.id);
    const version = await this._soap.createVersion({
      soap_note_id: note.id,
      session_id: note.session_id,
      transcript_version_id: note.transcript_version_id,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      version_number: versionNumber,
      note: note.note,
      provider: note.provider,
      model: note.model,
      prompt_version: note.prompt_version,
      input_hash: note.input_hash,
      generation_metadata: {
        ...(note.generation_metadata ?? {}),
        archivedBeforeRegeneration: true,
      },
      source: toDbSoapVersionSource("pre_regeneration"),
      diff_metadata: {
        label: versionNumber === 1 ? "Original" : `Version ${versionNumber}`,
        workflow_source: "pre_regeneration",
      },
      created_by: ctx.actorId,
    });

    await this._audit.log({
      action: AUDIT_ACTION.SOAP_VERSION_CREATED,
      sessionId: note.session_id,
      ctx,
      metadata: {
        soapNoteId: note.id,
        versionId: version.id,
        versionNumber,
        source: "pre_regeneration",
      },
    });

    return version;
  }

  async _createVersion(note, transcriptVersion, ctx, generated, source = "ai_generated", labelOverride) {
    const versionNumber = await this._soap.getNextVersionNumber(note.id);
    const label = labelOverride ?? (source === "ai_generated" ? "Original" : source);
    const version = await this._soap.createVersion({
      soap_note_id: note.id,
      session_id: note.session_id,
      transcript_version_id: transcriptVersion.id,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      version_number: versionNumber,
      note: note.note,
      provider: note.provider,
      model: note.model,
      prompt_version: note.prompt_version,
      input_hash: note.input_hash,
      generation_metadata: note.generation_metadata,
      source,
      diff_metadata: { label: `${label} (v${versionNumber})` },
      created_by: ctx.actorId,
    });

    await this._audit.log({
      action: AUDIT_ACTION.SOAP_VERSION_CREATED,
      sessionId: note.session_id,
      ctx,
      metadata: {
        soapNoteId: note.id,
        versionId: version.id,
        versionNumber,
        responseId: generated.response?.id ?? null,
      },
    });

    return version;
  }
}

function buildGenerationContext(context, transcriptVersion) {
  // Prefer live segments — transcript_versions.full_text can lag after edits/restores.
  const segmentText = (context.segments ?? [])
    .map((segment) => `${segment.speaker_label}: ${segment.text}`)
    .join("\n")
    .trim();
  const transcriptText = segmentText || transcriptVersion?.full_text?.trim() || "";

  return {
    patient: context.patient ? {
      age: context.patient.age,
      gender: context.patient.gender,
      knownCondition: context.patient.condition,
      status: context.patient.status,
      lastVisit: context.patient.last_visit,
    } : null,
    doctor: context.doctor ? {
      specialization: context.doctor.specialization,
      clinicName: context.doctor.clinic_name,
    } : null,
    consultation: {
      appointmentType: context.appointment?.type ?? null,
      appointmentDate: context.appointment?.date ?? null,
      appointmentNotes: context.appointment?.notes ?? null,
      language: context.session.language,
      sessionId: context.session.id,
      transcriptVersion: transcriptVersion.version_number,
    },
    transcriptText,
  };
}

function parseAndValidateSOAP(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new SOAPValidationError({ reason: "invalid_json", message: err.message });
  }

  const result = SOAPNoteSchema.safeParse(parsed);
  if (!result.success) {
    throw new SOAPValidationError(result.error.flatten());
  }
  return result.data;
}

function hashInput(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
