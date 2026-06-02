"use client";

export async function fetchTranscriptWorkspace(sessionId) {
  return requestJson(`/api/scribe/sessions/${sessionId}/review`);
}

export async function updateTranscriptSegment(sessionId, segmentId, payload) {
  return requestJson(`/api/scribe/sessions/${sessionId}/review/segments/${segmentId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function saveTranscriptVersion(sessionId, payload = {}) {
  return requestJson(`/api/scribe/sessions/${sessionId}/review/versions`, {
    method: "POST",
    body: payload,
  });
}

export async function fetchTranscriptVersions(sessionId) {
  return requestJson(`/api/scribe/sessions/${sessionId}/review/versions`);
}

export async function restoreTranscriptVersion(sessionId, versionId) {
  return requestJson(`/api/scribe/sessions/${sessionId}/review/versions/${versionId}/restore`, {
    method: "POST",
  });
}

export async function completeTranscriptReview(sessionId) {
  return requestJson(`/api/scribe/sessions/${sessionId}/review/complete`, {
    method: "POST",
    body: { create_version: true },
  });
}

export async function generateSOAPNote(sessionId, payload = {}) {
  return requestJson(`/api/scribe/sessions/${sessionId}/soap/generate`, {
    method: "POST",
    body: { force: true, ...payload },
  });
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload?.error || `Request failed with ${res.status}`);
    err.code = payload?.code;
    err.details = payload?.details;
    throw err;
  }
  return payload;
}
