/**
 * @fileoverview VitalsService — "Record Vitals" capture from the
 * Appointments dashboard row action, and vitals history for the patient
 * detail page.
 *
 * `create` always trusts appointment_id over any client-supplied
 * patientId: when an appointmentId is given, patient_id is derived from
 * that appointment record server-side (never from the request body) —
 * this is what "pre-filled from that appointment, no manual patient
 * lookup needed" (see the /appointments row action) actually means from a
 * trust-boundary standpoint, and it means a client can never record
 * vitals against a mismatched patient_id/appointment_id pair. Appointment-
 * linked create is only allowed while status is confirmed (409 otherwise).
 * A bare patientId (no appointmentId) is still accepted for a future
 * direct-entry path — the vitals table's appointment_id column is
 * nullable for exactly this reason.
 */

import { APPOINTMENT_STATUS } from "../booking/constants.js";

export class VitalsRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "VitalsRequestError";
    this.statusCode = statusCode;
  }
}

const MAX_NOTES_LENGTH = 2000;

/** @type {Record<string, { min: number; max: number; integer: boolean; label: string }>} */
const VITAL_FIELD_BOUNDS = {
  bloodPressureSystolic: { min: 40, max: 300, integer: true, label: "Systolic blood pressure" },
  bloodPressureDiastolic: { min: 20, max: 200, integer: true, label: "Diastolic blood pressure" },
  temperatureCelsius: { min: 25, max: 45, integer: false, label: "Temperature" },
  weightKg: { min: 0, max: 500, integer: false, label: "Weight" },
  heightCm: { min: 0, max: 300, integer: false, label: "Height" },
  pulseBpm: { min: 20, max: 300, integer: true, label: "Pulse" },
  spo2Percent: { min: 0, max: 100, integer: true, label: "SpO2" },
};

function parseOptionalNumber(raw, { min, max, integer, label }) {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new VitalsRequestError(`${label} must be a number`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new VitalsRequestError(`${label} must be a whole number`);
  }
  if (value < min || value > max) {
    throw new VitalsRequestError(`${label} must be between ${min} and ${max}`);
  }
  return value;
}

function parseNotes(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (value.length > MAX_NOTES_LENGTH) {
    throw new VitalsRequestError("Notes are too long");
  }
  return value;
}

/**
 * @param {object} input
 * @returns {Record<string, number|string|null>}
 */
function parseVitalFields(input) {
  const parsed = {};
  for (const [field, bounds] of Object.entries(VITAL_FIELD_BOUNDS)) {
    parsed[field] = parseOptionalNumber(input?.[field], bounds);
  }
  parsed.notes = parseNotes(input?.notes);

  const hasAnyValue = Object.values(parsed).some((value) => value !== null);
  if (!hasAnyValue) {
    throw new VitalsRequestError("Enter at least one vital reading or a note");
  }
  return parsed;
}

function formatVitalsRow(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
    bloodPressureSystolic: row.blood_pressure_systolic,
    bloodPressureDiastolic: row.blood_pressure_diastolic,
    temperatureCelsius: row.temperature_celsius,
    weightKg: row.weight_kg,
    heightCm: row.height_cm,
    pulseBpm: row.pulse_bpm,
    spo2Percent: row.spo2_percent,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class VitalsService {
  /**
   * @param {import("./vitals.repository.js").VitalsRepository} vitalsRepository
   * @param {import("../booking/repository/patient.repository.js").PatientRepository} patientRepository
   * @param {import("../booking/repository/appointment.repository.js").AppointmentRepository} appointmentRepository
   */
  constructor(vitalsRepository, patientRepository, appointmentRepository) {
    this._vitals = vitalsRepository;
    this._patients = patientRepository;
    this._appointments = appointmentRepository;
  }

  /**
   * @param {string} clinicId
   * @param {string|null} actorId - the recording user (ctx.actorId), stored as recorded_by
   * @param {{
   *   patientId?: string;
   *   appointmentId?: string;
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
  async create(clinicId, actorId, input) {
    let patientId = input?.patientId ? String(input.patientId) : null;
    let appointmentId = null;

    if (input?.appointmentId) {
      const appointment = await this._appointments.findByIdForClinic(
        clinicId,
        input.appointmentId,
      );
      if (!appointment) {
        throw new VitalsRequestError("Appointment not found", 404);
      }
      if (String(appointment.status ?? "").toLowerCase() !== APPOINTMENT_STATUS.CONFIRMED) {
        throw new VitalsRequestError(
          "Vitals can only be recorded for confirmed appointments",
          409,
        );
      }
      if (!appointment.patient_id) {
        throw new VitalsRequestError("Appointment has no linked patient");
      }
      appointmentId = appointment.id;
      // Authoritative: never trust a client-supplied patientId once an
      // appointment is linked — see file header.
      patientId = appointment.patient_id;
    }

    if (!patientId) {
      throw new VitalsRequestError("patientId or appointmentId is required");
    }

    const patient = await this._patients.findById(clinicId, patientId);
    if (!patient) {
      throw new VitalsRequestError("Patient not found", 404);
    }

    const fields = parseVitalFields(input ?? {});

    const created = await this._vitals.create({
      clinicId,
      patientId: patient.id,
      appointmentId,
      recordedBy: actorId ?? null,
      ...fields,
    });

    return { vitals: formatVitalsRow(created) };
  }

  /**
   * Full vitals history for one patient (patients/[id] detail page + GET
   * /api/vitals?patientId=), most recent first.
   *
   * @param {string} clinicId
   * @param {string} patientId
   */
  async listForPatient(clinicId, patientId) {
    const patient = await this._patients.findById(clinicId, patientId);
    if (!patient) {
      throw new VitalsRequestError("Patient not found", 404);
    }

    const rows = await this._vitals.listForPatient(clinicId, patientId);
    return rows.map((row) => formatVitalsRow(row));
  }
}
