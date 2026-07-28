/**
 * @fileoverview VaccinationSeedingService — auto-seeds vaccination_schedules
 * for pediatric patients from the standard IAP (Indian Academy of
 * Pediatrics) immunization schedule (lib/iap-schedule.js).
 *
 * Two callers:
 *   1. PatientsService.create — best-effort side effect right after a new
 *      patient is inserted with a date_of_birth on file (see that file).
 *   2. scripts/backfill-vaccination-schedules.mjs — one-time backfill for
 *      patients registered before this feature shipped.
 *
 * ── Pediatric gate ──────────────────────────────────────────────────────
 * There is no clinic-level "specialty" column in this schema. Pediatric
 * -ness is inferred from the clinic's primary doctor's
 * doctor_profiles.specialization (free text — see the SPECIALIZATIONS chip
 * list in app/(auth)/onboarding/page.js, which includes "Pediatrician"),
 * matched case-insensitively against both the American ("pediatric") and
 * British ("paediatric") spellings. This is a heuristic,
 * not a guaranteed signal — flagged as a known limitation should a
 * dedicated clinic specialty field be added later (see
 * DoctorProfileRepository.findPrimarySpecializationByClinicId).
 *
 * ── Idempotency ─────────────────────────────────────────────────────────
 * Seeding is skipped if the patient already has ANY vaccination_schedules
 * row (VaccinationRepository.existsForPatient) — regardless of whether
 * that row came from a prior auto-seed, the backfill script, or a manual
 * /vaccinations/new entry. Safe to call more than once per patient and
 * safe for the backfill script to re-run.
 *
 * ── Due-date filtering ──────────────────────────────────────────────────
 * Only IAP doses due today-or-later (within IAP_SEED_PAST_GRACE_DAYS of
 * "today", to absorb IST/UTC edge cases) are seeded — registering an older
 * child does not flood their record with doses that were already due years
 * ago and would immediately sweep to `overdue`. Doses further in the past
 * than the grace window are silently omitted (not seeded at all, not
 * counted as missed) — manual /vaccinations/new entry remains available
 * for catch-up doses.
 */

import { computeIapDueDates, addDaysToDateString } from "../../lib/iap-schedule.js";
import { createLogger } from "../booking/logger.js";

const PEDIATRIC_SPECIALIZATION_PATTERN = /pa?ediatric/i;
const IAP_SEED_PAST_GRACE_DAYS = 7;

/** @param {Date} date @returns {string} YYYY-MM-DD in Asia/Kolkata */
function istDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export class VaccinationSeedingService {
  /**
   * @param {import("./vaccination.repository.js").VaccinationRepository} vaccinationRepository
   * @param {import("../booking/repository/doctor-profile.repository.js").DoctorProfileRepository} doctorProfileRepository
   */
  constructor(vaccinationRepository, doctorProfileRepository) {
    this._vaccinations = vaccinationRepository;
    this._doctorProfiles = doctorProfileRepository;
    this._log = createLogger({ component: "VaccinationSeedingService" });
  }

  /**
   * @param {string} clinicId
   * @returns {Promise<boolean>}
   */
  async isPediatricClinic(clinicId) {
    const specialization = await this._doctorProfiles.findPrimarySpecializationByClinicId(clinicId);
    return Boolean(specialization && PEDIATRIC_SPECIALIZATION_PATTERN.test(specialization));
  }

  /**
   * Auto-seeds the (future-only) IAP schedule for one patient. Best-effort
   * by design — callers should never let a seeding failure block or roll
   * back the patient write itself.
   *
   * @param {{
   *   patientId: string;
   *   clinicId: string;
   *   dateOfBirth: string|null;
   *   now?: Date;
   *   dryRun?: boolean;
   * }} params
   * @returns {Promise<{ seeded: boolean; count?: number; reason?: string }>}
   */
  async seedVaccinationSchedule({ patientId, clinicId, dateOfBirth, now = new Date(), dryRun = false }) {
    if (!dateOfBirth) {
      return { seeded: false, reason: "NO_DATE_OF_BIRTH" };
    }

    const isPediatric = await this.isPediatricClinic(clinicId);
    if (!isPediatric) {
      return { seeded: false, reason: "NOT_PEDIATRIC_CLINIC" };
    }

    const alreadySeeded = await this._vaccinations.existsForPatient(patientId);
    if (alreadySeeded) {
      return { seeded: false, reason: "ALREADY_SEEDED" };
    }

    const cutoff = addDaysToDateString(istDateKey(now), -IAP_SEED_PAST_GRACE_DAYS);
    const entries = computeIapDueDates(dateOfBirth)
      .filter((entry) => entry.dueDate >= cutoff)
      .map((entry) => ({
        clinicId,
        patientId,
        vaccineName: entry.vaccineName,
        dueDate: entry.dueDate,
      }));

    if (entries.length === 0) {
      return { seeded: false, reason: "NO_UPCOMING_DOSES" };
    }

    if (dryRun) {
      return { seeded: false, reason: "DRY_RUN", count: entries.length };
    }

    const rows = await this._vaccinations.bulkCreate(entries);
    this._log.info("Auto-seeded IAP vaccination schedule", {
      clinicId,
      patientId,
      count: rows.length,
    });
    return { seeded: true, count: rows.length };
  }
}
