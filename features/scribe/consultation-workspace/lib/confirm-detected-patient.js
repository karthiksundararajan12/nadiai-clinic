/**
 * Confirm flow for a detected patient. Nothing is written until the doctor
 * taps Confirm, and a manual patient always wins over a later extraction.
 */

import { normalizePatientName } from "../../../patients/lib/patient-identity.js";
import { sexLabel } from "./patient-extraction.js";

export function createCaptureState() {
  return {
    stopped: false,
    manual: false,
    confirmed: false,
    patient: null,
    detected: null,
    existingPrompt: null,
  };
}

export function markManualPatient(state, patient) {
  return {
    ...state,
    stopped: true,
    manual: true,
    confirmed: false,
    patient,
    detected: null,
    existingPrompt: null,
  };
}

export function ingestExtraction(state, extracted) {
  if (!state || state.stopped || state.manual || state.confirmed) return state;
  if (!extracted?.name && extracted?.age == null) return state;
  return { ...state, detected: extracted };
}

export function dismissDetection(state) {
  return { ...state, stopped: true, detected: null, existingPrompt: null };
}

/**
 * @param {{ name?: string|null, age?: number|null, age_unit?: string|null }} fields
 * @param {{ full_name?: string, name?: string, age_years?: number|null, age?: number|null }} patient
 */
export function sameNameAndAge(fields, patient) {
  const left = normalizePatientName(fields?.name);
  const right = normalizePatientName(patient?.full_name ?? patient?.name);
  if (!left || left !== right) return false;
  const age = patient?.age_years ?? patient?.age;
  if (fields?.age_unit === "months") return age === 0 || age == null;
  return Number(age) === Number(fields?.age);
}

/**
 * @param {object} fields
 * @param {{ findByPhone: (phone: string) => Promise<object[]>, findByNameAge: (fields: object) => Promise<object[]>, createPatient: (fields: object) => Promise<object>, attach?: (patientId: string) => Promise<void> }} deps
 */
export async function confirmDetectedPatient(fields, deps, { forceCreate = false } = {}) {
  const name = String(fields?.name ?? "").trim();
  if (!name) return { action: "need-name" };

  if (!forceCreate && fields?.phone) {
    const matches = await deps.findByPhone(fields.phone);
    if (matches[0]) {
      return { action: "confirm-existing", reason: "phone", patient: matches[0] };
    }
  } else if (!forceCreate && fields?.age != null) {
    const matches = await deps.findByNameAge(fields);
    const hit = matches.find((patient) => sameNameAndAge(fields, patient));
    if (hit) return { action: "confirm-existing", reason: "name-age", patient: hit };
  }

  const created = await deps.createPatient(fields);
  if (deps.attach) await deps.attach(created.id);
  return { action: "created", patient: created };
}

export async function acceptExistingPatient(patient, deps) {
  if (deps.attach) await deps.attach(patient.id);
  return { action: "attached", patient };
}

export function existingPatientPrompt(patient) {
  const name = patient?.full_name ?? patient?.name ?? "this patient";
  const when = patient?.lastVisitLabel || "no previous visit";
  return `Existing patient found: ${name}, last visit ${when}. Use this patient?`;
}

export function toPatientChip(fields, id) {
  const gender = sexLabel(fields?.sex) || fields?.gender || null;
  return {
    id,
    name: fields.name,
    age: fields.age ?? null,
    age_unit: fields.age_unit === "months" ? "months" : "years",
    gender,
    phone: fields.phone || "",
    appointment_id: null,
  };
}

export function createPayload(fields, { allowFamilyMember = false } = {}) {
  return {
    name: fields.name,
    phone: fields.phone || "",
    age: fields.age_unit === "months" ? "" : fields.age ?? "",
    gender: sexLabel(fields.sex) || "",
    consentGiven: false,
    allowMissingPhone: !fields.phone,
    ...(allowFamilyMember ? { allowFamilyMember: true } : {}),
  };
}
