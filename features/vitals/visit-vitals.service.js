/**
 * One visit_vitals row per scribe visit. Blur saves update that row.
 * Out-of-range readings are stored; the amber check flag is a UI concern.
 */

export class VisitVitalsRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "VisitVitalsRequestError";
    this.statusCode = statusCode;
  }
}

const WIDE_BOUNDS = {
  bp_systolic: { min: 0, max: 400, integer: true },
  bp_diastolic: { min: 0, max: 300, integer: true },
  pulse: { min: 0, max: 400, integer: true },
  temp: { min: 0, max: 120, integer: false },
  spo2: { min: 0, max: 100, integer: true },
  weight: { min: 0, max: 500, integer: false },
  height: { min: 0, max: 300, integer: false },
  sugar: { min: 0, max: 2000, integer: false },
};

function parseOptional(raw, bounds, label) {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new VisitVitalsRequestError(`${label} must be a number`);
  }
  if (bounds.integer && !Number.isInteger(value)) {
    throw new VisitVitalsRequestError(`${label} must be a whole number`);
  }
  if (value < bounds.min || value > bounds.max) {
    throw new VisitVitalsRequestError(`${label} must be between ${bounds.min} and ${bounds.max}`);
  }
  return value;
}

export function parseVisitVitalsInput(input = {}) {
  const tempUnit = input.temp_unit == null || input.temp_unit === ""
    ? null
    : String(input.temp_unit).toUpperCase();
  if (tempUnit && tempUnit !== "F" && tempUnit !== "C") {
    throw new VisitVitalsRequestError("Temperature unit must be F or C");
  }
  const sugarUnit = input.sugar_unit == null || input.sugar_unit === ""
    ? null
    : String(input.sugar_unit);
  if (sugarUnit && sugarUnit !== "mg/dL" && sugarUnit !== "mmol/L") {
    throw new VisitVitalsRequestError("Sugar unit must be mg/dL or mmol/L");
  }
  const sugarType = input.sugar_type == null || input.sugar_type === ""
    ? null
    : String(input.sugar_type);
  if (sugarType && sugarType !== "random" && sugarType !== "fasting" && sugarType !== "pp") {
    throw new VisitVitalsRequestError("Sugar type must be random, fasting, or pp");
  }
  return {
    bp_systolic: parseOptional(input.bp_systolic, WIDE_BOUNDS.bp_systolic, "Systolic blood pressure"),
    bp_diastolic: parseOptional(input.bp_diastolic, WIDE_BOUNDS.bp_diastolic, "Diastolic blood pressure"),
    pulse: parseOptional(input.pulse, WIDE_BOUNDS.pulse, "Pulse"),
    temp: parseOptional(input.temp, WIDE_BOUNDS.temp, "Temperature"),
    temp_unit: tempUnit,
    spo2: parseOptional(input.spo2, WIDE_BOUNDS.spo2, "SpO2"),
    weight: parseOptional(input.weight, WIDE_BOUNDS.weight, "Weight"),
    height: parseOptional(input.height, WIDE_BOUNDS.height, "Height"),
    sugar: parseOptional(input.sugar, WIDE_BOUNDS.sugar, "Sugar"),
    sugar_unit: sugarUnit,
    sugar_type: sugarType,
    heard_text: input.heard_text ? String(input.heard_text).slice(0, 2000) : null,
  };
}

export function formatVisitVitalsRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    sessionId: row.session_id,
    bp_systolic: row.bp_systolic,
    bp_diastolic: row.bp_diastolic,
    pulse: row.pulse,
    temp: row.temp == null ? null : Number(row.temp),
    temp_unit: row.temp_unit,
    spo2: row.spo2,
    weight: row.weight_kg == null ? null : Number(row.weight_kg),
    height: row.height_cm == null ? null : Number(row.height_cm),
    sugar: row.sugar == null ? null : Number(row.sugar),
    sugar_unit: row.sugar_unit,
    sugar_type: row.sugar_type,
    heard_text: row.heard_text,
    updatedAt: row.updated_at,
  };
}

function toDbPatch(fields, ids) {
  return {
    clinic_id: ids.clinicId,
    patient_id: ids.patientId,
    appointment_id: ids.appointmentId,
    session_id: ids.sessionId,
    bp_systolic: fields.bp_systolic,
    bp_diastolic: fields.bp_diastolic,
    pulse: fields.pulse,
    temp: fields.temp,
    temp_unit: fields.temp == null ? null : fields.temp_unit,
    spo2: fields.spo2,
    weight_kg: fields.weight,
    height_cm: fields.height,
    sugar: fields.sugar,
    sugar_unit: fields.sugar == null ? null : (fields.sugar_unit ?? "mg/dL"),
    sugar_type: fields.sugar == null ? null : (fields.sugar_type ?? "random"),
    heard_text: fields.heard_text,
    updated_at: new Date().toISOString(),
  };
}

export class VisitVitalsService {
  /**
   * @param {import("./visit-vitals.repository.js").VisitVitalsRepository} visitVitals
   * @param {{ findById: Function }} patients
   * @param {{ findByIdForClinic: Function }} appointments
   */
  constructor(visitVitals, patients, appointments) {
    this._vitals = visitVitals;
    this._patients = patients;
    this._appointments = appointments;
  }

  async save(clinicId, input) {
    const patientId = input?.patientId ? String(input.patientId) : "";
    if (!patientId) throw new VisitVitalsRequestError("patientId is required");
    const patient = await this._patients.findById(clinicId, patientId);
    if (!patient) throw new VisitVitalsRequestError("Patient not found", 404);

    let appointmentId = input?.appointmentId ? String(input.appointmentId) : null;
    if (appointmentId) {
      const appointment = await this._appointments.findByIdForClinic(clinicId, appointmentId);
      if (!appointment) throw new VisitVitalsRequestError("Appointment not found", 404);
      if (appointment.patient_id && appointment.patient_id !== patient.id) {
        throw new VisitVitalsRequestError("Appointment is for a different patient");
      }
      appointmentId = appointment.id;
    }

    const sessionId = input?.sessionId ? String(input.sessionId) : null;
    const fields = parseVisitVitalsInput(input ?? {});
    const existing = await this._vitals.findForVisit({
      clinicId,
      patientId: patient.id,
      appointmentId,
      sessionId,
    });
    const patch = toDbPatch(fields, {
      clinicId,
      patientId: patient.id,
      appointmentId,
      sessionId: sessionId ?? existing?.session_id ?? null,
    });

    const saved = existing
      ? await this._vitals.update(existing.id, patch)
      : await this._vitals.insert(patch);
    return { vitals: formatVisitVitalsRow(saved) };
  }

  async find(clinicId, { patientId, appointmentId, sessionId } = {}) {
    if (patientId) {
      const patient = await this._patients.findById(clinicId, patientId);
      if (!patient) throw new VisitVitalsRequestError("Patient not found", 404);
    }
    const row = await this._vitals.findForVisit({
      clinicId,
      patientId: patientId ?? null,
      appointmentId: appointmentId ?? null,
      sessionId: sessionId ?? null,
    });
    if (row && row.clinic_id !== clinicId) return { vitals: null };
    return { vitals: formatVisitVitalsRow(row) };
  }
}
