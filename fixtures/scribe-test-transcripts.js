/**
 * Fixture transcripts for offline SOAP generation checks.
 * Used by scripts/test-scribe-fixtures.mjs (text → Gemini SOAP path).
 */

/** @typedef {{
 *   id: string;
 *   description: string;
 *   transcript: string;
 *   patient?: { age?: number; gender?: string };
 *   expect: Record<string, unknown>;
 * }} ScribeFixture */

/** @type {Record<string, ScribeFixture>} */
export const fixtures = {
  durationRange: {
    id: "durationRange",
    description:
      "Dose/duration ranges like '3-4 days' must be preserved in Plan, not collapsed to '3'.",
    patient: { age: 32, gender: "female" },
    transcript: [
      "Doctor: What brings you in today?",
      "Patient: I've had a sore throat and mild fever for two days.",
      "Doctor: Any difficulty swallowing or breathlessness?",
      "Patient: No, just the throat pain.",
      "Doctor: Throat looks inflamed. This is likely acute pharyngitis.",
      "Doctor: I'll start antibiotics for 3-4 days — take them after food.",
      "Doctor: Also paracetamol 500-650mg if fever comes, and warm salt water gargles.",
      "Doctor: Come back if it worsens or fever lasts beyond four days.",
    ].join("\n"),
    expect: {
      planContains: ["3-4 days", "500-650mg"],
      planDoesNotContainCollapsed: ["for 3 days"],
    },
  },

  vitalsUndocumented: {
    id: "vitalsUndocumented",
    description:
      "When no vitals are mentioned, Objective is the not-documented fallback and structured vitals stay empty.",
    patient: { age: 41, gender: "male" },
    transcript: [
      "Doctor: Tell me what's going on.",
      "Patient: I've had a dry cough since yesterday, and I feel a bit tired.",
      "Doctor: Any fever, chest pain, or breathlessness?",
      "Patient: No fever, no chest pain. Just the cough.",
      "Doctor: Sounds like a mild viral cough. Rest, fluids, and a cough syrup if needed.",
      "Doctor: If you develop fever or breathlessness, come back.",
    ].join("\n"),
    expect: {
      objective: "Not documented in transcript.",
      vitals: {
        bpSys: "",
        bpDia: "",
        hr: "",
        temp: "",
        spo2: "",
        weight: "",
      },
    },
  },
};

export default fixtures;
