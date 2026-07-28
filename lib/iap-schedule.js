/**
 * @fileoverview Standard IAP (Indian Academy of Pediatrics) immunization
 * schedule, expressed as offsets in days from date_of_birth rather than
 * fixed calendar ages — lets a due_date be computed for any patient as
 * `date_of_birth + offsetDays` (see computeIapDueDates).
 *
 * Reference: IAP Advisory Committee on Vaccination & Immunization Practices
 * (ACVIP) recommended schedule. This is a general reference implementation
 * covering the most commonly administered doses from the birth dose through
 * adolescent boosters — it is NOT a substitute for clinical judgment.
 * Always verify against the current IAP guidelines and each clinic's own
 * protocol; eligibility/spacing for some doses (e.g. HPV, Influenza,
 * Typhoid boosters) can vary by patient history, sex, or state guidance.
 *
 * Used by features/vaccinations/vaccination-seeding.service.js to
 * auto-seed vaccination_schedules for pediatric patients.
 */

/** @typedef {{ vaccineName: string; offsetDays: number }} IapScheduleEntry */

/** @type {ReadonlyArray<IapScheduleEntry>} */
export const IAP_IMMUNIZATION_SCHEDULE = Object.freeze([
  // Birth
  { vaccineName: "BCG", offsetDays: 0 },
  { vaccineName: "OPV - 0 (Birth dose)", offsetDays: 0 },
  { vaccineName: "Hepatitis B - 1 (Birth dose)", offsetDays: 0 },

  // 6 weeks
  { vaccineName: "DTwP/DTaP - 1", offsetDays: 42 },
  { vaccineName: "IPV - 1", offsetDays: 42 },
  { vaccineName: "Hib - 1", offsetDays: 42 },
  { vaccineName: "Rotavirus - 1", offsetDays: 42 },
  { vaccineName: "PCV - 1", offsetDays: 42 },
  { vaccineName: "Hepatitis B - 2", offsetDays: 42 },

  // 10 weeks
  { vaccineName: "DTwP/DTaP - 2", offsetDays: 70 },
  { vaccineName: "IPV - 2", offsetDays: 70 },
  { vaccineName: "Hib - 2", offsetDays: 70 },
  { vaccineName: "Rotavirus - 2", offsetDays: 70 },
  { vaccineName: "PCV - 2", offsetDays: 70 },

  // 14 weeks
  { vaccineName: "DTwP/DTaP - 3", offsetDays: 98 },
  { vaccineName: "IPV - 3", offsetDays: 98 },
  { vaccineName: "Hib - 3", offsetDays: 98 },
  { vaccineName: "Rotavirus - 3", offsetDays: 98 },
  { vaccineName: "PCV - 3", offsetDays: 98 },
  { vaccineName: "Hepatitis B - 3", offsetDays: 98 },

  // 6 months
  { vaccineName: "Influenza (IIV) - 1", offsetDays: 182 },
  // 7 months (4 weeks after Influenza dose 1)
  { vaccineName: "Influenza (IIV) - 2", offsetDays: 210 },

  // 9 months
  { vaccineName: "MMR - 1", offsetDays: 270 },
  { vaccineName: "Typhoid Conjugate Vaccine (TCV)", offsetDays: 270 },

  // 12 months
  { vaccineName: "Hepatitis A - 1", offsetDays: 365 },

  // 15 months
  { vaccineName: "MMR - 2", offsetDays: 456 },
  { vaccineName: "Varicella - 1", offsetDays: 456 },
  { vaccineName: "PCV - Booster", offsetDays: 456 },

  // 16-18 months
  { vaccineName: "DTwP/DTaP - Booster 1", offsetDays: 487 },
  { vaccineName: "IPV - Booster 1", offsetDays: 487 },
  { vaccineName: "Hib - Booster", offsetDays: 487 },

  // 18 months (6 months after Hepatitis A - 1)
  { vaccineName: "Hepatitis A - 2", offsetDays: 548 },
  { vaccineName: "Varicella - 2", offsetDays: 548 },

  // 2 years
  { vaccineName: "Typhoid - Booster", offsetDays: 730 },

  // 4-6 years
  { vaccineName: "DTwP/DTaP - Booster 2", offsetDays: 1461 },
  { vaccineName: "IPV - Booster 2", offsetDays: 1461 },

  // 10-12 years
  { vaccineName: "Tdap/Td", offsetDays: 3653 },
  { vaccineName: "HPV - 1", offsetDays: 3653 },
  { vaccineName: "HPV - 2", offsetDays: 3835 }, // 6 months after HPV - 1
]);

/**
 * Adds (or subtracts, for negative `days`) whole days to a YYYY-MM-DD date
 * string using UTC-based arithmetic so the result never shifts due to the
 * server's local timezone or DST — mirrors the date-key helpers already
 * used in vaccination-reminder.service.js.
 *
 * @param {string} dateStr YYYY-MM-DD
 * @param {number} days
 * @returns {string} YYYY-MM-DD
 */
export function addDaysToDateString(dateStr, days) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Computes the full IAP schedule's due dates for a specific patient.
 *
 * @param {string} dateOfBirth YYYY-MM-DD
 * @returns {Array<{ vaccineName: string; dueDate: string }>}
 */
export function computeIapDueDates(dateOfBirth) {
  return IAP_IMMUNIZATION_SCHEDULE.map(({ vaccineName, offsetDays }) => ({
    vaccineName,
    dueDate: addDaysToDateString(dateOfBirth, offsetDays),
  }));
}
