import { APPOINTMENT_STATUS } from "../booking/constants.js";
import {
  formatPhoneForDisplay,
  normalizePhoneForWhatsApp,
} from "../booking/lib/phone.js";
import { formatAppointmentStatusLabel } from "../booking/lib/appointment-list.js";
import { formatPaymentStatusLabel } from "../booking/lib/payment-list.js";
import { formatSlotLabel } from "../booking/lib/slot-engine.js";
import { createLogger } from "../booking/logger.js";
import { alertOps, OPS_ALERT_STEP } from "../booking/lib/alerting.js";
import { resolvePatientRegisteredDateRange } from "./lib/patient-list.js";

const log = createLogger({ component: "PatientsService" });

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function parseDateOfBirth(rawDateOfBirth) {
  const value = String(rawDateOfBirth ?? "").trim();
  if (!value) return null;
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new PatientRequestError("Date of birth must be a valid date (YYYY-MM-DD)");
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  if (value > todayKey) {
    throw new PatientRequestError("Date of birth cannot be in the future");
  }
  return value;
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
    dateOfBirth: patient.date_of_birth ?? null,
    dateOfBirthIsApproximate: patient.date_of_birth_is_approximate ?? false,
    phone: formatPhoneForDisplay(patient.contact_phone),
    lastVisit,
    upcomingVisit,
    createdAt: patient.created_at ?? null,
  };
}

/**
 * Same VISIT_STATUSES semantics as buildVisitIndex, but scoped to a single
 * page/batch of appointments and computing a count (total visits) rather
 * than an upcoming-visit lookahead — used by listPaginated, which only
 * needs "last appointment" + "total visits" per row, not the full
 * last/upcoming split the clinic-wide list() view uses.
 */
function buildVisitStatsByPatient(appointments, nowMs) {
  const lastAppointmentByPatient = new Map();
  const totalVisitsByPatient = new Map();

  for (const appointment of appointments) {
    if (!appointment.patient_id || !VISIT_STATUSES.has(appointment.status)) {
      continue;
    }
    const slotMs = Date.parse(appointment.slot_start);
    if (!Number.isFinite(slotMs) || slotMs > nowMs) continue;

    const patientId = appointment.patient_id;
    totalVisitsByPatient.set(patientId, (totalVisitsByPatient.get(patientId) ?? 0) + 1);

    const current = lastAppointmentByPatient.get(patientId);
    if (!current || slotMs > Date.parse(current)) {
      lastAppointmentByPatient.set(patientId, appointment.slot_start);
    }
  }

  return { lastAppointmentByPatient, totalVisitsByPatient };
}

/**
 * Same IST-aware slot formatting appointments/payments already use for
 * their "Slot"/"Appointment" columns (formatSlotLabel) — reused here rather
 * than a new date-only formatter, so "Last Appointment" reads consistently
 * with the rest of the dashboard.
 */
function formatVisitSlotLabel(iso) {
  if (!iso) return null;
  const slotStart = new Date(iso);
  return Number.isNaN(slotStart.getTime()) ? null : formatSlotLabel(slotStart);
}

function formatAppointmentHistoryRow(row) {
  const slotStart = row.slot_start ? new Date(row.slot_start) : null;
  return {
    id: row.id,
    slotStart: row.slot_start,
    slotLabel: slotStart && !Number.isNaN(slotStart.getTime())
      ? formatSlotLabel(slotStart)
      : null,
    status: row.status,
    statusLabel: formatAppointmentStatusLabel(row.status),
    paymentStatus: row.payment_status,
    paymentStatusLabel:
      !row.payment_status || row.payment_status === "not_required"
        ? "—"
        : formatPaymentStatusLabel(row.payment_status),
    amount: row.payment_amount,
    createdAt: row.created_at,
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
  /**
   * @param {import("../booking/repository/patient.repository.js").PatientRepository} patientRepository
   * @param {import("../booking/repository/appointment.repository.js").AppointmentRepository} appointmentRepository
   * @param {{ vaccinationSeedingService?: import("../vaccinations/vaccination-seeding.service.js").VaccinationSeedingService|null }} [opts]
   */
  constructor(patientRepository, appointmentRepository, { vaccinationSeedingService = null } = {}) {
    this._patients = patientRepository;
    this._appointments = appointmentRepository;
    this._vaccinationSeeding = vaccinationSeedingService;
  }

  async list(clinicId, now = new Date()) {
    const patients = await this._patients.findAllForClinic(clinicId);

    let appointments = [];
    try {
      appointments = await this._appointments.findForClinic(clinicId, {
        ascending: false,
      });
    } catch {
      // Visit metadata is best-effort — patient rows must still load if the
      // appointments query fails (e.g. transient DB/embed error).
    }

    const visitIndex = buildVisitIndex(appointments, now.getTime());
    const formatted = patients.map((patient) => formatPatientRow(patient, visitIndex));

    return {
      patients: formatted,
      stats: buildStats(patients, visitIndex),
    };
  }

  async search(clinicId, query, now = new Date()) {
    const result = await this.list(clinicId, now);
    const needle = String(query ?? "").trim().toLowerCase();
    if (needle.length < 2) {
      return { patients: [], stats: result.stats };
    }

    const normalizedNeedle = needle.replace(/\s+/g, "");
    const patients = result.patients.filter((patient) => {
      const name = patient.name.toLowerCase();
      const phone = patient.phone.replace(/\s+/g, "").toLowerCase();
      return name.includes(needle) || phone.includes(normalizedNeedle);
    });

    return { patients, stats: result.stats };
  }

  async listOptions(clinicId) {
    const patients = await this._patients.findAllForClinic(clinicId);
    return patients.map((patient) => ({
      id: patient.id,
      name: patient.full_name,
    }));
  }

  /**
   * Paginated, searchable, filterable clinic patient list for the dashboard
   * table — same shape/approach as AppointmentsService.listPaginated /
   * PaymentsService.list (server-side search + date range + limit/offset,
   * with an exact total for pagination).
   *
   * @param {string} clinicId
   * @param {{
   *   search?: string|null;
   *   range?: string|null;
   *   from?: string|null;
   *   to?: string|null;
   *   limit?: number;
   *   offset?: number;
   * }} [filters]
   * @param {Date} [now]
   */
  async listPaginated(clinicId, {
    search = null,
    range = "all",
    from = null,
    to = null,
    limit = 20,
    offset = 0,
  } = {}, now = new Date()) {
    const { fromIso, toIso } = resolvePatientRegisteredDateRange(range, { from, to });
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const { rows, total } = await this._patients.listForClinic(clinicId, {
      search,
      fromIso,
      toIso,
      limit: safeLimit,
      offset: safeOffset,
    });

    const patientIds = rows.map((row) => row.id);
    let visitAppointments = [];
    try {
      visitAppointments = patientIds.length > 0
        ? await this._appointments.findForPatients(clinicId, patientIds)
        : [];
    } catch {
      // Visit metadata is best-effort — patient rows must still load if the
      // appointments query fails (same trade-off as list()).
    }
    const { lastAppointmentByPatient, totalVisitsByPatient } =
      buildVisitStatsByPatient(visitAppointments, now.getTime());

    const patients = rows.map((row) => {
      const lastAppointment = lastAppointmentByPatient.get(row.id) ?? null;
      return {
        id: row.id,
        name: row.full_name,
        phone: formatPhoneForDisplay(row.contact_phone),
        age: row.age_years ?? null,
        gender: row.gender ?? null,
        dateOfBirth: row.date_of_birth ?? null,
        dateOfBirthIsApproximate: row.date_of_birth_is_approximate ?? false,
        lastAppointment,
        lastAppointmentLabel: formatVisitSlotLabel(lastAppointment),
        totalVisits: totalVisitsByPatient.get(row.id) ?? 0,
        createdAt: row.created_at ?? null,
      };
    });

    return {
      patients,
      total,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + patients.length < total,
    };
  }

  /**
   * Single clinic-scoped patient plus their full appointment history, for
   * the /patients/[id] detail page. Vaccination schedule is fetched
   * separately by VaccinationsService (features/vaccinations) — kept out of
   * this feature the same way PatientsService.create only *triggers*
   * vaccination seeding via an injected service, never queries vaccination
   * data itself.
   *
   * @param {string} clinicId
   * @param {string} patientId
   */
  async getDetail(clinicId, patientId) {
    const patient = await this._patients.findById(clinicId, patientId);
    if (!patient) {
      throw new PatientRequestError("Patient not found", 404);
    }

    const appointments = await this._appointments.findForPatient(clinicId, patientId);
    const appointmentHistory = appointments.map((row) => formatAppointmentHistoryRow(row));
    const { lastAppointmentByPatient, totalVisitsByPatient } =
      buildVisitStatsByPatient(appointments, Date.now());
    const lastAppointment = lastAppointmentByPatient.get(patient.id) ?? null;

    return {
      patient: {
        id: patient.id,
        name: patient.full_name,
        age: patient.age_years ?? null,
        gender: patient.gender ?? null,
        dateOfBirth: patient.date_of_birth ?? null,
        dateOfBirthIsApproximate: patient.date_of_birth_is_approximate ?? false,
        phone: formatPhoneForDisplay(patient.contact_phone),
        lastAppointment,
        lastAppointmentLabel: formatVisitSlotLabel(lastAppointment),
        totalVisits: totalVisitsByPatient.get(patient.id) ?? 0,
        createdAt: patient.created_at ?? null,
      },
      appointmentHistory,
    };
  }

  /**
   * Creates a patient, then — best-effort, never blocking or rolling back
   * the patient write — auto-seeds the standard IAP vaccination schedule
   * when both a date_of_birth was provided and the clinic is pediatric
   * (see VaccinationSeedingService). Auto-seed is the default path for new
   * registrations; the manual /vaccinations/new form remains available for
   * exceptions, catch-up doses, and edits regardless of whether auto-seed
   * ran.
   */
  async create(clinicId, input) {
    const dateOfBirth = parseDateOfBirth(input.dateOfBirth);
    const created = await this._patients.create({
      clinic_id: clinicId,
      contact_phone: parseContactPhone(input.phone),
      full_name: parseFullName(input.name),
      age_years: parseAgeYears(input.age),
      gender: parseGender(input.gender),
      date_of_birth: dateOfBirth,
    });

    if (this._vaccinationSeeding && dateOfBirth) {
      try {
        await this._vaccinationSeeding.seedVaccinationSchedule({
          patientId: created.id,
          clinicId,
          dateOfBirth,
        });
      } catch (err) {
        log.error("Vaccination schedule auto-seed failed after patient create", {
          clinicId,
          patientId: created.id,
          error: err instanceof Error ? err.message : String(err),
        });
        await alertOps({
          title: "Vaccination schedule auto-seed failed after patient create (dashboard manual add)",
          step: OPS_ALERT_STEP.VACCINATION_SEED,
          error: err,
          clinicId,
          patientId: created.id,
        });
      }
    }

    return {
      patient: {
        id: created.id,
        name: created.full_name,
        age: created.age_years ?? null,
        gender: created.gender ?? null,
        dateOfBirth: created.date_of_birth ?? null,
        dateOfBirthIsApproximate: created.date_of_birth_is_approximate ?? false,
        phone: formatPhoneForDisplay(created.contact_phone),
        lastVisit: null,
        upcomingVisit: null,
        createdAt: created.created_at ?? null,
      },
    };
  }
}
