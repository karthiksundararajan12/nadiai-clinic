import { SOAP_GENERATION_CONFIG } from "../constants.js";

export const SOAP_JSON_SCHEMA = {
  name: "nadi_ai_soap_note",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "subjective",
      "objective",
      "assessment",
      "plan",
      "chiefComplaint",
      "historyOfPresentIllness",
      "clinicalSummary",
    ],
    properties: {
      subjective: { type: "string" },
      objective: { type: "string" },
      assessment: { type: "string" },
      plan: { type: "string" },
      chiefComplaint: { type: "string" },
      historyOfPresentIllness: { type: "string" },
      clinicalSummary: { type: "string" },
    },
  },
  strict: true,
};

export function buildSOAPPrompt(context) {
  return [
    {
      role: "system",
      content: [
        "You are Nadi AI, a clinical documentation assistant for Indian outpatient general practice clinics.",
        "Generate only a structured SOAP note as JSON matching the provided schema.",
        "Use ONLY information explicitly present in the reviewed transcript and provided context.",
        "Do not fabricate diagnoses, medications, vitals, test results, allergies, examination findings, or follow-up plans.",
        "If information is not available, write 'Not documented in transcript.'",
        "Do not include prescriptions unless a medication was explicitly discussed in the transcript.",
        "Keep language professional, concise, and suitable for a doctor to review.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Prompt version: ${SOAP_GENERATION_CONFIG.PROMPT_VERSION}`,
        "",
        "PATIENT CONTEXT:",
        safeJson(context.patient ?? {}),
        "",
        "DOCTOR CONTEXT:",
        safeJson(context.doctor ?? {}),
        "",
        "CONSULTATION CONTEXT:",
        safeJson(context.consultation ?? {}),
        "",
        "REVIEWED TRANSCRIPT:",
        context.transcriptText || "Not documented in transcript.",
        "",
        "TASK:",
        "Create a SOAP note for this consultation.",
        "For Objective, include only observed/reported objective findings explicitly present; otherwise say 'Not documented in transcript.'",
        "For Assessment, describe clinical impression only if supported by transcript; otherwise state that assessment is not documented.",
        "For Plan, include only explicit advice/tests/follow-up discussed; otherwise state 'Not documented in transcript.'",
      ].join("\n"),
    },
  ];
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}
