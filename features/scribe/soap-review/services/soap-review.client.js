"use client";

export async function fetchSOAPReviewWorkspace(sessionId) {
  return requestJson(`/api/scribe/sessions/${sessionId}/soap/review`);
}

export async function updateSOAPSection(sessionId, payload) {
  return requestJson(`/api/scribe/sessions/${sessionId}/soap/review/sections`, {
    method: "PATCH",
    body: payload,
  });
}

export async function saveSOAPVersion(sessionId, payload = {}) {
  return requestJson(`/api/scribe/sessions/${sessionId}/soap/review/versions`, {
    method: "POST",
    body: payload,
  });
}

export async function fetchSOAPVersions(sessionId) {
  return requestJson(`/api/scribe/sessions/${sessionId}/soap/review/versions`);
}

export async function compareSOAPVersions(sessionId, fromVersionId, toVersionId) {
  return requestJson(`/api/scribe/sessions/${sessionId}/soap/review/versions/compare`, {
    method: "POST",
    body: { from_version_id: fromVersionId, to_version_id: toVersionId },
  });
}

export async function approveSOAPNote(sessionId) {
  return requestJson(`/api/scribe/sessions/${sessionId}/soap/review/approve`, {
    method: "POST",
    body: { create_version: true },
  });
}

export async function rejectSOAPNote(sessionId, reason) {
  return requestJson(`/api/scribe/sessions/${sessionId}/soap/review/reject`, {
    method: "POST",
    body: { reason },
  });
}

export async function regenerateSOAPNote(sessionId) {
  return requestJson(`/api/scribe/sessions/${sessionId}/soap/retry`, {
    method: "POST",
    body: { force: true },
  });
}

export async function restoreSOAPVersion(sessionId, versionId) {
  return requestJson(
    `/api/scribe/sessions/${sessionId}/soap/review/versions/${versionId}/restore`,
    { method: "POST" },
  );
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
