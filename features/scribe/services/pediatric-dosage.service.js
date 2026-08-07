/**
 * Pediatric dosage audit / lookup service.
 *
 * Dose calculation stays in lib/pediatric-dosage (pure). This service owns
 * persistence of suggested vs doctor-confirmed doses.
 */

import {
  PrescriptionReviewError,
  SessionNotFoundError,
  SessionValidationError,
} from "../errors.js";
import { LogPediatricDoseSchema } from "../schemas.js";
import { createLogger } from "../logger.js";
import { calculatePediatricDose } from "../lib/pediatric-dosage/calculator.js";
import { findPediatricDosageReference } from "../lib/pediatric-dosage/reference-data.js";

export class PediatricDosageService {
  /**
   * @param {import("../repository/session.repository.js").SessionRepository} sessionRepository
   * @param {import("../repository/pediatric-dosage.repository.js").PediatricDosageRepository} pediatricDosageRepository
   */
  constructor(sessionRepository, pediatricDosageRepository) {
    this._sessions = sessionRepository;
    this._dosage = pediatricDosageRepository;
    this._log = createLogger({ component: "PediatricDosageService" });
  }

  /**
   * @param {string} sessionId
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async listReferences(sessionId, ctx) {
    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);
    return this._dosage.listActiveReferences();
  }

  /**
   * Logs a suggested / accepted / dismissed / exceeds_max pediatric dose event.
   * On `accepted`, stores both suggested and confirmed dose displays.
   *
   * @param {string} sessionId
   * @param {unknown} rawBody
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async logDoseEvent(sessionId, rawBody, ctx) {
    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);

    const parsed = LogPediatricDoseSchema.safeParse(rawBody);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const body = parsed.data;

    const catalog = await this._dosage.listActiveReferences();
    const reference =
      findPediatricDosageReference(body.drug_name, catalog) ??
      findPediatricDosageReference(body.reference_drug_name, catalog);

    const calc = calculatePediatricDose({
      drugName: body.drug_name,
      weightKg: body.weight_kg,
      reference,
    });

    const suggestedDisplay =
      body.suggested_dose_display ??
      (calc.ok || calc.reason === "exceeds_max" ? calc.displayDose : null);
    const suggestedMg =
      body.suggested_dose_mg ??
      (calc.ok || calc.reason === "exceeds_max" ? calc.calculatedMg : null);
    const suggestedMl =
      body.suggested_dose_ml ?? (calc.ok ? calc.doseMl : null);

    if (body.action === "accepted" && !body.confirmed_dose_display?.trim()) {
      throw new PrescriptionReviewError(
        "confirmed_dose_display is required when accepting a pediatric dose",
      );
    }

    const row = {
      session_id: sessionId,
      clinic_id: session.clinic_id,
      doctor_id: ctx.doctorId,
      patient_id: session.patient_id ?? null,
      medication_index: body.medication_index ?? null,
      drug_name: body.drug_name,
      reference_drug_name: body.reference_drug_name || reference?.drugName || body.drug_name,
      weight_kg: body.weight_kg,
      suggested_dose_mg: suggestedMg,
      suggested_dose_ml: suggestedMl,
      suggested_dose_display: suggestedDisplay,
      confirmed_dose_display:
        body.action === "accepted" ? body.confirmed_dose_display.trim() : null,
      action: body.action,
      metadata: {
        ...(body.metadata ?? {}),
        calcReason: calc.ok ? "ok" : calc.reason,
        exceedsMax: Boolean(calc.exceedsMax),
      },
    };

    try {
      const saved = await this._dosage.insertDoseAudit(row);
      return { audit: saved };
    } catch (err) {
      // Don't block the doctor UI if audit table isn't migrated yet.
      this._log.error("Failed to persist pediatric dose audit", {
        sessionId,
        action: body.action,
        error: err instanceof Error ? err.message : String(err),
      });
      return { audit: null, warning: "audit_persist_failed" };
    }
  }
}
