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
Generate prescriptions using Indian brand names commonly available in India.
Use dosage format: 1-0-1 (morning-afternoon-night).

Doctor style context (from past approved prescriptions):
${doctorStyleContext || "(No past prescriptions on file — use standard clinical protocols.)"}

Patient: ${patientAge} ${patientGender}
Diagnosis from SOAP: ${soapNote.assessment || "(not documented)"}
Plan from SOAP: ${soapNote.plan || "(not documented)"}

Generate a prescription as JSON only, no markdown, no preamble:
{
  "drugs": [
    {
      "name": "brand name",
      "dose": "500mg",
      "frequency": "1-0-1",
      "duration": "5 days",
      "instructions": "after food"
    }
  ],
  "advice": "rest and fluid intake advice",
  "followup_days": 5
}

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
          required: ["name", "dose", "frequency", "duration", "instructions"],
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            dose: { type: "string" },
            frequency: { type: "string" },
            duration: { type: "string" },
            instructions: { type: "string" },
          },
        },
      },
      advice: { type: "string" },
      followup_days: { type: "number" },
    },
  },
};
