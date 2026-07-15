"use client";

import {
  createPatient as createPatientRequest,
  fetchPatients,
  toScribePatient,
} from "@/features/patients/patients.client.js";

export async function searchPatients(query) {
  const q = String(query ?? "").trim();
  if (q.length < 2) return [];

  const payload = await fetchPatients({ query: q });
  return (payload.patients ?? []).map(toScribePatient);
}

export async function createPatient(input) {
  const payload = await createPatientRequest(input);
  return toScribePatient(payload.patient);
}

export async function attachPatientToSession(sessionId, patientId) {
  const res = await fetch(`/api/scribe/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update", patient_id: patientId }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Failed to attach patient (${res.status})`);
  }
  return payload;
}
