/**
 * @fileoverview Prescription prompt builder and Gemini JSON schema.
 */

/**
 * @typedef {Object} PrescriptionGenerationContext
 * @property {{ subjective: string; objective: string; assessment: string; plan: string; chiefComplaint: string; historyOfPresentIllness: string; clinicalSummary: string }} soapNote
 * @property {string}        transcriptText
 * @property {{ age?: number|null; gender?: string|null; knownConditions?: string|null } | null} patient
 * @property {{ fullName?: string|null; specialization?: string|null; clinicName?: string|null } | null} doctor
 * @property {{ language?: string|null; sessionId: string }} consultation
 * @property {string}        doctorStyleContext
 */

/**
 * @param {PrescriptionGenerationContext} ctx
 * @returns {Array<{ role: "system"|"user"; content: string }>}
 */
export function buildPrescriptionPrompt(ctx) {
  const { soapNote, patient, doctorStyleContext = "" } = ctx;

  const patientAge = patient?.age != null ? `${patient.age}yr` : "unknown age";
  const patientGender = patient?.gender ?? "unknown gender";

  const system = `You are a clinical prescription assistant for Indian doctors.
Suggest medicines using Indian brand names commonly available in India.
Use dosage format: 1-0-1 (morning-afternoon-night).

These are SUGGESTIONS only for the doctor to review and edit — never finalize care yourself.

Doctor style context (from past approved prescriptions):
${doctorStyleContext || "(No past prescriptions on file — use standard clinical protocols.)"}

Patient: ${patientAge} ${patientGender}
Diagnosis from SOAP: ${soapNote.assessment || "(not documented)"}
Plan from SOAP: ${soapNote.plan || "(not documented)"}

Generate a prescription draft as JSON only, no markdown, no preamble:
{
  "drugs": [
    {
      "name": "brand name",
      "dose": "500mg",
      "frequency": "1-0-1",
      "duration": "5 days",
      "instructions": "after food",
      "confidence": 0.85
    }
  ],
  "advice": "rest and fluid intake advice",
  "followup_days": 5
}

Rules for drugs:
- If Assessment/diagnosis is missing, unclear, or only says it was not documented, return "drugs": [] (empty array). Do NOT invent medicines.
- Only suggest medicines that are reasonable for the stated assessment and what was discussed.
- Preserve duration and dose ranges exactly as stated in the Plan (e.g. "3-4 days", "500-1000mg"). Never collapse a range to a single lower/upper bound.
- confidence is 0.0–1.0 reflecting how sure you are that this medicine/dose/frequency/duration fits (lower when uncertain).

Only respond with valid JSON. Nothing else.`;

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `Chief complaint: ${soapNote.chiefComplaint || "(not documented)"}
Assessment: ${soapNote.assessment || "(not documented)"}
Plan: ${soapNote.plan || "(not documented)"}

Generate the prescription JSON now.`,
    },
  ];
}

/** JSON schema for Gemini structured output (Indian GP prescription format). */
export const PRESCRIPTION_JSON_SCHEMA = {
  name: "prescription",
  strict: true,
  schema: {
    type: "object",
    required: ["drugs", "advice", "followup_days"],
    additionalProperties: false,
    properties: {
      drugs: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "dose", "frequency", "duration", "instructions", "confidence"],
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            dose: { type: "string" },
            frequency: { type: "string" },
            duration: { type: "string" },
            instructions: { type: "string" },
            confidence: { type: "number" },
          },
        },
      },
      advice: { type: "string" },
      followup_days: { type: "number" },
    },
  },
};
