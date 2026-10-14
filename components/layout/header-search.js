const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export const HEADER_SEARCH_MIN_CHARS = 2;

/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {string|null} YYYY-MM-DD
 */
function toIsoDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Calendar day a header query is asking for, if it looks like a date.
 * Day-first (`14/10/2026`, `14 Oct`) matches how the clinic writes dates.
 *
 * @param {string} query
 * @param {number} [fallbackYear]
 * @returns {string|null}
 */
export function parseHeaderSearchDate(query, fallbackYear = new Date().getFullYear()) {
  const text = String(query ?? "").trim().replace(/,/g, "");
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numeric) return toIsoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));

  const dayMonth = text.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?$/);
  if (dayMonth) {
    const month = MONTHS[dayMonth[2].toLowerCase()];
    if (!month) return null;
    return toIsoDate(Number(dayMonth[3] ?? fallbackYear), month, Number(dayMonth[1]));
  }

  const monthDay = text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/);
  if (monthDay) {
    const month = MONTHS[monthDay[1].toLowerCase()];
    if (!month) return null;
    return toIsoDate(Number(monthDay[3] ?? fallbackYear), month, Number(monthDay[2]));
  }

  return null;
}

async function readSearchPayload(response, label) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `${label} failed (${response.status})`);
  }
  return payload;
}

/**
 * @param {object[]} rows
 * @returns {object[]}
 */
function uniqueAppointments(rows) {
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
    if (unique.length >= 6) break;
  }
  return unique;
}

/**
 * Clinic-scoped patient name/phone search plus appointment name and date search.
 * Queries shorter than 2 characters do not hit the network.
 *
 * @param {string} query
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal, now?: Date }} [opts]
 */
export async function fetchHeaderSearchResults(query, { fetchImpl = fetch, signal, now = new Date() } = {}) {
  const q = String(query ?? "").trim();
  if (q.length < HEADER_SEARCH_MIN_CHARS) {
    return { patients: [], appointments: [], failed: false };
  }

  const date = parseHeaderSearchDate(q, now.getFullYear());
  const patientUrl = `/api/patients?search=${encodeURIComponent(q)}&limit=6`;
  const appointmentUrl = `/api/appointments?search=${encodeURIComponent(q)}&range=all&status=all&limit=6`;
  const dateUrl = date
    ? `/api/appointments?range=custom&from=${date}&to=${date}&status=all&limit=6`
    : null;

  const requests = [
    fetchImpl(patientUrl, { cache: "no-store", signal }).then((response) => readSearchPayload(response, "Patient search")),
    fetchImpl(appointmentUrl, { cache: "no-store", signal }).then((response) => readSearchPayload(response, "Appointment search")),
  ];
  if (dateUrl) {
    requests.push(
      fetchImpl(dateUrl, { cache: "no-store", signal }).then((response) => readSearchPayload(response, "Appointment date search")),
    );
  }

  const settled = await Promise.allSettled(requests);
  let failed = false;
  let patients = [];
  let appointments = [];

  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      if (result.reason?.name === "AbortError") return;
      failed = true;
      console.error("Header search failed", { label: index === 0 ? "Patient search" : "Appointment search", error: result.reason });
      return;
    }
    if (index === 0) {
      patients = Array.isArray(result.value.patients) ? result.value.patients.slice(0, 6) : [];
      return;
    }
    const rows = Array.isArray(result.value.appointments) ? result.value.appointments : [];
    appointments = appointments.concat(rows);
  });

  return { patients, appointments: uniqueAppointments(appointments), failed };
}
