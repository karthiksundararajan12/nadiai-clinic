import { APPOINTMENT_STATUS } from "../booking/constants.js";
import {
  formatPhoneForDisplay,
  normalizePhoneForWhatsApp,
} from "../booking/lib/phone.js";

const VISIT_STATUSES = new Set([
  APPOINTMENT_STATUS.CONFIRMED,
  APPOINTMENT_STATUS.COMPLETED,
  APPOINTMENT_STATUS.NO_SHOW,
  APPOINTMENT_STATUS.RESCHEDULE_REQUESTED,
]);

export class PatientRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PatientRequestError";
    this.statusCode = statusCode;
  }
}

function parseFullName(rawName) {
  const name = String(rawName ?? "").trim();
  if (!name) {
    throw new PatientRequestError("Full name is required");
  }
  return name;
}

function parseContactPhone(rawPhone) {
  const digits = normalizePhoneForWhatsApp(rawPhone);
  if (!digits) {
    throw new PatientRequestError("Phone number is required");
  }
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `91${digits}`;
  }
  if (digits.length === 12 && /^91[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  throw new PatientRequestError(
    "Enter a valid Indian mobile number (10 digits, or +91 followed by 10 digits)",
  );
}

function parseAgeYears(rawAge) {
  if (rawAge === null || rawAge === undefined || rawAge === "") {
    return null;
  }
  const age = Number(rawAge);
  if (!Number.isFinite(age) || !Number.isInteger(age) || age < 0 || age > 150) {
    throw new PatientRequestError("Age must be a whole number between 0 and 150");
  }
  return age;
}

function parseGender(rawGender) {
  const gender = String(rawGender ?? "").trim();
  return gender || null;
}

function buildVisitIndex(appointments, nowMs) {
  const lastVisitByPatient = new Map();
  const upcomingVisitByPatient = new Map();

  for (const appointment of appointments) {
    if (!appointment.patient_id || !VISIT_STATUSES.has(appointment.status)) {
      continue;
    }

    const slotMs = Date.parse(appointment.slot_start);
    if (!Number.isFinite(slotMs)) continue;

    const patientId = appointment.patient_id;

    if (slotMs <= nowMs) {
      const current = lastVisitByPatient.get(patientId);
      if (!current || slotMs > Date.parse(current)) {
        lastVisitByPatient.set(patientId, appointment.slot_start);
      }
      continue;
    }

    if (appointment.status === APPOINTMENT_STATUS.CONFIRMED) {
      const current = upcomingVisitByPatient.get(patientId);
      if (!current || slotMs < Date.parse(current)) {
        upcomingVisitByPatient.set(patientId, appointment.slot_start);
      }
    }
  }

  return { lastVisitByPatient, upcomingVisitByPatient };
}

function formatPatientRow(patient, visitIndex) {
  const lastVisit = visitIndex.lastVisitByPatient.get(patient.id) ?? null;
  const upcomingVisit = visitIndex.upcomingVisitByPatient.get(patient.id) ?? null;

  return {
    id: patient.id,
    name: patient.full_name,
    age: patient.age_years ?? null,
    gender: patient.gender ?? null,
    phone: formatPhoneForDisplay(patient.contact_phone),
    lastVisit,
    upcomingVisit,
    createdAt: patient.created_at ?? null,
  };
}

function buildStats(patients, visitIndex) {
  let withUpcomingVisit = 0;
  let noAppointmentsYet = 0;

  for (const patient of patients) {
    const hasLastVisit = visitIndex.lastVisitByPatient.has(patient.id);
    const hasUpcoming = visitIndex.upcomingVisitByPatient.has(patient.id);
    if (hasUpcoming) withUpcomingVisit += 1;
    if (!hasLastVisit && !hasUpcoming) noAppointmentsYet += 1;
  }

  return {
    totalPatients: patients.length,
    withUpcomingVisit,
    noAppointmentsYet,
  };
}

export class PatientsService {
  constructor(patientRepository, appointmentRepository) {
    this._patients = patientRepository;
    this._appointments = appointmentRepository;
  }

  async list(clinicId, now = new Date()) {
    const [patients, appointments] = await Promise.all([
      this._patients.findAllForClinic(clinicId),
      this._appointments.findForClinic(clinicId, { ascending: false }),
    ]);

    const visitIndex = buildVisitIndex(appointments, now.getTime());
    const formatted = patients.map((patient) => formatPatientRow(patient, visitIndex));

    return {
      patients: formatted,
      stats: buildStats(patients, visitIndex),
    };
  }

  async create(clinicId, input) {
    const created = await this._patients.create({
      clinic_id: clinicId,
      contact_phone: parseContactPhone(input.phone),
      full_name: parseFullName(input.name),
      age_years: parseAgeYears(input.age),
      gender: parseGender(input.gender),
    });

    return {
      patient: {
        id: created.id,
        name: created.full_name,
        age: created.age_years ?? null,
        gender: created.gender ?? null,
        phone: formatPhoneForDisplay(created.contact_phone),
        lastVisit: null,
        upcomingVisit: null,
        createdAt: created.created_at ?? null,
      },
    };
  }
}
