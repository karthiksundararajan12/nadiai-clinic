async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to process patient request");
  }
  return payload;
}

/**
 * Shared client for clinic-scoped patient reads/writes via /api/patients.
 * Used by the Patients page, Scribe PatientSelector, and any future UI.
 */
export async function fetchPatients({ signal, query } = {}) {
  const trimmedQuery = String(query ?? "").trim();
  const url =
    trimmedQuery.length >= 2
      ? `/api/patients?q=${encodeURIComponent(trimmedQuery)}`
      : "/api/patients";

  return readResponse(
    await fetch(url, { cache: "no-store", signal }),
  );
}

/**
 * @param {string} patientId
 */
export async function fetchPatientDetail(patientId) {
  return readResponse(
    await fetch(`/api/patients/${encodeURIComponent(patientId)}`, {
      cache: "no-store",
    }),
  );
}

export async function createPatient(input) {
  return readResponse(
    await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

/**
 * @param {string} patientId
 */
export async function fetchPatientDeletionImpact(patientId) {
  return readResponse(
    await fetch(
      `/api/patients/${encodeURIComponent(patientId)}/deletion-impact`,
      { cache: "no-store" },
    ),
  );
}

/**
 * Hard-deletes a patient and cascaded history.
 *
 * @param {string} patientId
 */
export async function deletePatient(patientId) {
  return readResponse(
    await fetch(`/api/patients/${encodeURIComponent(patientId)}`, {
      method: "DELETE",
    }),
  );
}

/**
 * Builds the `/patients?highlight=…` path used to land back on the list
 * with a newly created patient's row highlighted (same `?highlight=`
 * mechanism as /appointments — see
 * features/appointments/appointments.client.js#buildHighlightRedirectPath).
 * Returns null when there's no id to highlight, so callers can fall back
 * to a plain refresh.
 *
 * @param {string|null|undefined} patientId
 * @returns {string|null}
 */
export function buildHighlightRedirectPath(patientId) {
  if (typeof patientId !== "string" || patientId.length === 0) {
    return null;
  }
  return `/patients?highlight=${encodeURIComponent(patientId)}`;
}

/** Normalizes API camelCase fields for Scribe components expecting last_visit. */
export function toScribePatient(patient) {
  return {
    id: patient.id,
    name: patient.name,
    age: patient.age ?? null,
    gender: patient.gender ?? null,
    phone: patient.phone,
    last_visit: patient.lastVisit ?? null,
  };
}
