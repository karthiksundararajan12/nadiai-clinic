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

export async function createPatient(input) {
  return readResponse(
    await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
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
