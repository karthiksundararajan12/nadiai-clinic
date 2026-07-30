async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to process vitals request");
  }
  return payload;
}

/**
 * Records vitals via POST /api/vitals. Pass `appointmentId` for the normal
 * "Record Vitals" appointment-row flow — the server derives patientId from
 * the appointment itself (see VitalsService.create), so it does not need
 * to be supplied here as well.
 *
 * @param {{
 *   appointmentId?: string;
 *   patientId?: string;
 *   bloodPressureSystolic?: number|string|null;
 *   bloodPressureDiastolic?: number|string|null;
 *   temperatureCelsius?: number|string|null;
 *   weightKg?: number|string|null;
 *   heightCm?: number|string|null;
 *   pulseBpm?: number|string|null;
 *   spo2Percent?: number|string|null;
 *   notes?: string|null;
 * }} input
 */
export async function createVitals(input) {
  return readResponse(
    await fetch("/api/vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

/**
 * @param {string} patientId
 * @returns {Promise<{ vitals: object[] }>}
 */
export async function fetchVitalsForPatient(patientId) {
  return readResponse(
    await fetch(`/api/vitals?patientId=${encodeURIComponent(patientId)}`, {
      cache: "no-store",
    }),
  );
}
