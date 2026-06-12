"use client";

/**
 * @typedef {Object} SubmitManualTranscriptOptions
 * @property {string} text
 * @property {string} [language]
 * @property {string} [patientId]
 * @property {string} [appointmentId]
 */

/**
 * Creates a session and imports a manually entered transcript (skips Whisper).
 *
 * @param {SubmitManualTranscriptOptions} options
 */
export async function submitManualTranscript(options) {
  const { text, language, patientId, appointmentId } = options;

  const res = await fetch("/api/scribe/sessions/manual-transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      language,
      patient_id: patientId ?? null,
      appointment_id: appointmentId ?? null,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload?.error || `Manual transcript failed (${res.status})`);
    if (payload?.code) err.code = payload.code;
    throw err;
  }

  return payload;
}
