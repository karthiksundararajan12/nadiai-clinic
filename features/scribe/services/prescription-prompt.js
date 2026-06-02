/**
 * @fileoverview prescription-prompt.js
 *
 * Builds the structured prompt sent to Claude for prescription draft generation,
 * and defines the strict JSON tool schema that enforces the output shape.
 *
 * CLINICAL SAFETY GUARANTEE
 * ─────────────────────────
 * The prompt instructs the model to EXTRACT, never INVENT.
 * Every medication, diagnosis, and investigation must be traceable to an explicit
 * statement in the SOAP note or transcript. Anything uncertain must be flagged
 * in the `warnings` array with a low confidence score.
 *
 * This draft is NOT a final clinical decision. It REQUIRES doctor review.
 */

/**
 * @typedef {Object} PrescriptionGenerationContext
 * @property {{ subjective: string; objective: string; assessment: string; plan: string; chiefComplaint: string; historyOfPresentIllness: string; clinicalSummary: string }} soapNote
 * @property {string}        transcriptText
 * @property {{ age?: number|null; gender?: string|null; knownConditions?: string|null } | null} patient
 * @property {{ fullName?: string|null; specialization?: string|null; clinicName?: string|null } | null} doctor
 * @property {{ language?: string|null; sessionId: string }} consultation
 */

/**
 * Assembles the Claude messages array for prescription draft generation.
 *
 * @param {PrescriptionGenerationContext} ctx
 * @returns {Array<{ role: "system"|"user"; content: string }>}
 */
export function buildPrescriptionPrompt(ctx) {
  const { soapNote, transcriptText, patient, doctor, consultation } = ctx;

  const patientBlock = patient
    ? [
        patient.age    ? `Age: ${patient.age}` : null,
        patient.gender ? `Gender: ${patient.gender}` : null,
        patient.knownConditions ? `Known conditions: ${patient.knownConditions}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "Patient details not available.";

  const doctorBlock = doctor
    ? [
        doctor.fullName       ? `Doctor: ${doctor.fullName}` : null,
        doctor.specialization ? `Specialization: ${doctor.specialization}` : null,
        doctor.clinicName     ? `Clinic: ${doctor.clinicName}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const system = `You are a clinical documentation assistant for Indian general practitioners.
Your ONLY task is to extract a structured prescription draft from the SOAP note and consultation transcript provided below.

══════════════════════════════════════════════════════
CRITICAL CLINICAL SAFETY RULES — ABSOLUTE CONSTRAINTS
══════════════════════════════════════════════════════

1. NEVER invent medications. Include ONLY medications explicitly named in the SOAP note or transcript.
2. NEVER invent dosages. Use ONLY dosages explicitly stated. If a dosage is missing or unclear, omit the medication or set confidence to 0.3 and add a warning.
3. NEVER invent diagnoses. Document ONLY conditions explicitly stated in the Assessment section.
4. NEVER invent investigations. List ONLY tests explicitly ordered or discussed in the Plan section.
5. NEVER invent allergies, contraindications, or comorbidities not documented in the consultation.
6. NEVER invent or assume treatment plans beyond what is explicitly stated.
7. NEVER prescribe any medication not directly mentioned in the consultation.
8. Flag EVERY ambiguity, uncertainty, or missing piece of information in the warnings array.
9. Set confidence < 0.7 for any medication where dosage, frequency, or duration is uncertain.
10. This draft REQUIRES doctor review before any patient use. It is a documentation aid, not a clinical decision.

You are EXTRACTING information that was already spoken by the doctor.
You are NOT a prescribing physician. You do NOT make clinical decisions.
If something was NOT said, do NOT include it.

══════════════════════════════════════════════════════
OUTPUT CONSTRAINTS
══════════════════════════════════════════════════════

- diagnosis: Only conditions explicitly stated in the Assessment.
- medications: Only drugs explicitly mentioned, with exactly the details stated.
- investigations: Only tests explicitly ordered.
- advice: Only lifestyle/dietary advice explicitly given.
- followUpInstructions: Only follow-up timing/instructions explicitly stated.
- warnings: Flag missing dosages, uncertain diagnoses, potential interactions mentioned, anything unclear.

If the consultation has no medications, return an empty medications array.
If the consultation has no follow-up instructions, return an empty string.
Return honest, minimal, grounded output only.`;

  const user = `── PATIENT INFORMATION ──────────────────────────────────
${patientBlock}

${doctorBlock ? `── DOCTOR INFORMATION ────────────────────────────────────\n${doctorBlock}\n\n` : ""}── CONSULTATION LANGUAGE ─────────────────────────────────
${consultation.language ?? "Not specified"}

── SOAP NOTE ─────────────────────────────────────────────

Chief Complaint:
${soapNote.chiefComplaint || "(not documented)"}

History of Present Illness:
${soapNote.historyOfPresentIllness || "(not documented)"}

Subjective:
${soapNote.subjective || "(not documented)"}

Objective:
${soapNote.objective || "(not documented)"}

Assessment:
${soapNote.assessment || "(not documented)"}

Plan:
${soapNote.plan || "(not documented)"}

Clinical Summary:
${soapNote.clinicalSummary || "(not documented)"}

── CONSULTATION TRANSCRIPT ───────────────────────────────
${transcriptText || "(transcript not available)"}

── TASK ─────────────────────────────────────────────────
Extract a prescription draft strictly from the above SOAP note and transcript.
Do NOT add anything that was not explicitly stated.
Flag any uncertainty in the warnings array.`;

  return [
    { role: "system", content: system },
    { role: "user",   content: user   },
  ];
}

/**
 * JSON schema passed to Claude's tool_use call.
 * Defines the exact shape of the prescription draft output.
 *
 * @type {{ name: string; schema: Record<string, unknown>; strict: boolean }}
 */
export const PRESCRIPTION_JSON_SCHEMA = {
  name:   "prescription_draft",
  strict: true,
  schema: {
    type: "object",
    required: [
      "diagnosis",
      "medications",
      "investigations",
      "advice",
      "followUpInstructions",
      "warnings",
    ],
    additionalProperties: false,
    properties: {
      diagnosis: {
        type:        "array",
        description: "List of diagnoses explicitly stated in the Assessment section only.",
        items:       { type: "string", minLength: 1, maxLength: 500 },
      },
      medications: {
        type:        "array",
        description: "Medications explicitly mentioned in the SOAP note or transcript. Empty array if none mentioned.",
        items: {
          type: "object",
          required: ["name", "dosage", "frequency", "duration", "instructions", "confidence"],
          additionalProperties: false,
          properties: {
            name: {
              type:        "string",
              description: "Exact drug name as spoken by the doctor.",
            },
            dosage: {
              type:        "string",
              description: "Exact dosage as stated. Use 'Not specified' if the doctor did not state a dosage.",
            },
            frequency: {
              type:        "string",
              description: "Dosing frequency as stated (e.g. 'twice daily', 'BD', 'TDS'). Use 'Not specified' if unclear.",
            },
            duration: {
              type:        "string",
              description: "Duration of treatment as stated (e.g. '5 days', '1 week'). Use 'Not specified' if unclear.",
            },
            instructions: {
              type:        "string",
              description: "Additional instructions explicitly stated (e.g. 'after meals', 'at bedtime'). Empty string if none stated.",
            },
            confidence: {
              type:        "number",
              minimum:     0,
              maximum:     1,
              description: "Confidence that this medication detail is correctly extracted. < 0.7 if any field is uncertain or inferred.",
            },
          },
        },
      },
      investigations: {
        type:        "array",
        description: "Laboratory tests or investigations explicitly ordered or discussed.",
        items:       { type: "string", minLength: 1, maxLength: 500 },
      },
      advice: {
        type:        "array",
        description: "Lifestyle, dietary, or behavioural advice explicitly given.",
        items:       { type: "string", minLength: 1, maxLength: 1000 },
      },
      followUpInstructions: {
        type:        "string",
        description: "Follow-up timing or instructions as explicitly stated. Empty string if not mentioned.",
        maxLength:   2000,
      },
      warnings: {
        type:        "array",
        description: "Flags for the reviewing doctor: missing dosages, unclear diagnoses, uncertain extractions, potential issues noted during the consultation.",
        items:       { type: "string", minLength: 1, maxLength: 1000 },
      },
    },
  },
};
