"use client";

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload?.error || `Request failed (${res.status})`);
    err.code = payload?.code;
    throw err;
  }
  return payload;
}

export async function generatePrescription(sessionId, options = {}) {
  return requestJson(`/api/scribe/sessions/${sessionId}/prescription/generate`, {
    method: "POST",
    body: options,
  });
}

export async function fetchPrescriptionWorkspace(sessionId) {
  return requestJson(`/api/scribe/sessions/${sessionId}/prescription/review`);
}

export async function updatePrescriptionDraft(sessionId, draft, source = "manual_edit") {
  return requestJson(`/api/scribe/sessions/${sessionId}/prescription/review`, {
    method: "PATCH",
    body: { draft, source },
  });
}

export async function approvePrescription(sessionId) {
  return requestJson(`/api/scribe/sessions/${sessionId}/prescription/review/approve`, {
    method: "POST",
    body: { create_version: true },
  });
}

/**
 * Persist suggested / accepted pediatric dose for audit + traction tracking.
 * Soft-fails in the UI — callers may ignore errors.
 *
 * @param {string} sessionId
 * @param {Record<string, unknown>} payload
 */
export async function logPediatricDoseEvent(sessionId, payload) {
  return requestJson(`/api/scribe/sessions/${sessionId}/prescription/pediatric-dose`, {
    method: "POST",
    body: payload,
  });
}
