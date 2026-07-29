/**
 * @fileoverview VaccinationsService — dashboard list + manual entry for
 * public.vaccination_schedules (migration 030).
 *
 * `create` here is manual-entry only (mirroring PatientsService.create's
 * validation style) — used for exceptions, catch-up doses, and edits.
 * Automatic seeding of the standard IAP schedule on patient creation lives
 * separately in vaccination-seeding.service.js (VaccinationSeedingService),
 * invoked from PatientsService.create, not from here.
 */

import {
  formatVaccinationStatusLabel,
  resolveVaccinationDueDateRange,
  vaccinationStatusFilterToDb,
} from "./vaccination-list.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class VaccinationRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "VaccinationRequestError";
    this.statusCode = statusCode;
  }
}

function parseVaccineName(raw) {
  const name = String(raw ?? "").trim();
  if (!name) {
    throw new VaccinationRequestError("Vaccine name is required");
  }
  if (name.length > 200) {
    throw new VaccinationRequestError("Vaccine name is too long");
  }
  return name;
}

function parseDueDate(raw) {
  const value = String(raw ?? "").trim();
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new VaccinationRequestError("A valid due date (YYYY-MM-DD) is required");
  }
  return value;
}

/**
 * @param {object} row
 * @param {{ patientName?: string|null; patientDateOfBirthIsApproximate?: boolean }} [overrides]
 *   Used by create() to supply the patient fields it already looked up
 *   separately, since the freshly-inserted vaccination_schedules row has no
 *   patient join of its own.
 */
function formatVaccinationRow(row, overrides = {}) {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: overrides.patientName ?? row.patient_name ?? "Unknown patient",
    // The linked patient's DOB may itself be an age-derived approximation
    // (see PatientCollectionService / parseAgeOrDob), which this due_date
    // was computed from — surfaced so the dashboard can flag it the same
    // way the patient's own DOB display does.
    patientDateOfBirthIsApproximate:
      overrides.patientDateOfBirthIsApproximate ?? row.patient_date_of_birth_is_approximate ?? false,
    vaccineName: row.vaccine_name,
    dueDate: row.due_date,
    status: row.status,
    statusLabel: formatVaccinationStatusLabel(row.status),
    reminderSentAt: row.reminder_sent_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export class VaccinationsService {
  /**
   * @param {import("./vaccination.repository.js").VaccinationRepository} vaccinationRepository
   * @param {import("../booking/repository/patient.repository.js").PatientRepository} patientRepository
   */
  constructor(vaccinationRepository, patientRepository) {
    this._vaccinations = vaccinationRepository;
    this._patients = patientRepository;
  }

  /**
   * @param {string} clinicId
   * @param {{
   *   search?: string|null;
   *   status?: string|null;
   *   range?: string|null;
   *   from?: string|null;
   *   to?: string|null;
   *   limit?: number;
   *   offset?: number;
   * }} [filters]
   */
  async list(clinicId, {
    search = null,
    status = "all",
    range = "all",
    from = null,
    to = null,
    limit = 20,
    offset = 0,
  } = {}) {
    const dbStatus = vaccinationStatusFilterToDb(status);
    const { fromDate, toDate } = resolveVaccinationDueDateRange(range, { from, to });
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const { rows, total } = await this._vaccinations.listForClinic(clinicId, {
      status: dbStatus,
      fromDate,
      toDate,
      search,
      limit: safeLimit,
      offset: safeOffset,
    });

    const vaccinations = rows.map((row) => formatVaccinationRow(row));

    return {
      vaccinations,
      total,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + vaccinations.length < total,
    };
  }

  /**
   * @param {string} clinicId
   * @param {{ patientId: string; vaccineName: string; dueDate: string }} input
   */
  async create(clinicId, input) {
    if (!input?.patientId) {
      throw new VaccinationRequestError("patientId is required");
    }
    const patient = await this._patients.findById(clinicId, input.patientId);
    if (!patient) {
      throw new VaccinationRequestError("Patient not found", 404);
    }

    const vaccineName = parseVaccineName(input.vaccineName);
    const dueDate = parseDueDate(input.dueDate);

    const created = await this._vaccinations.create({
      clinicId,
      patientId: patient.id,
      vaccineName,
      dueDate,
    });

    return {
      vaccination: formatVaccinationRow(created, {
        patientName: patient.full_name,
        patientDateOfBirthIsApproximate: patient.date_of_birth_is_approximate,
      }),
    };
  }
}
