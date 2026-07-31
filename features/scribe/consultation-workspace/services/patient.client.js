"use client";

import {
  createPatient as createPatientRequest,
  toScribePatient,
} from "@/features/patients/patients.client.js";

/**
 * Confirmed-appointment patients eligible to start a consultation
 * (excludes appointments that already have a COMPLETED scribe session).
 *
 * @returns {Promise<Array<{
 *   id: string;
 *   name: string;
 *   age: number|null;
 *   gender: string|null;
 *   phone: string|null;
 *   last_visit: null;
 *   appointment_id: string;
 *   slot_label: string|null;
 *   slot_start: string|null;
 * }>>}
 */
export async function fetchEligibleConsultationPatients() {
  const res = await fetch("/api/scribe/eligible-patients", { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Failed to load eligible patients (${res.status})`);
  }

  return (payload.patients ?? []).map((row) => ({
    id: row.patientId,
    name: row.patientName,
    age: row.patientAge ?? null,
    gender: row.patientGender ?? null,
    phone: row.patientPhone ?? null,
    last_visit: null,
    appointment_id: row.appointmentId,
    slot_label: row.slotLabel ?? null,
    slot_start: row.slotStart ?? null,
  }));
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
