/**
 * Patient-facing WhatsApp confirmation after a slot is booked.
 * Free-form text (not a Meta template). Fee is always taken from the
 * doctor/clinic record passed in — never a hardcoded amount.
 */

import { formatConfirmationDateTimeParts } from "./slot-engine.js";
import { resolveConsultationFee, toWholeRupees } from "./consultation-fee.js";

/**
 * Title-cases a patient name for the confirmation message.
 *
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function titleCaseName(name) {
  if (typeof name !== "string") return "";
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Prefer the doctor's configured consultation_fee; fall back to a stamped
 * appointment amount. Includes 0 when the doctor has set a free consult.
 *
 * @param {{
 *   doctor?: { consultation_fee?: number|string|null } | null;
 *   feeRupees?: number|string|null;
 *   paymentAmount?: number|string|null;
 * }} input
 * @returns {number|null}
 */
export function resolveConfirmationFeeRupees({
  doctor = null,
  feeRupees = null,
  paymentAmount = null,
} = {}) {
  const fromDoctor = resolveConsultationFee(doctor);
  if (fromDoctor.configured && Number.isFinite(fromDoctor.feeRupees) && fromDoctor.feeRupees >= 0) {
    return Math.round(fromDoctor.feeRupees);
  }
  return toWholeRupees(feeRupees ?? paymentAmount);
}

/**
 * @param {{
 *   patientName?: string|null;
 *   doctorName?: string|null;
 *   clinicName?: string|null;
 *   slotStart: Date|string;
 *   consultationFee?: number|null;
 *   clinicAddress?: string|null;
 *   doctorClinicAddress?: string|null;
 * }} input
 * @returns {string}
 */
export function buildSlotConfirmationMessage({
  patientName,
  doctorName,
  clinicName,
  slotStart,
  consultationFee = null,
  clinicAddress = null,
  doctorClinicAddress = null,
}) {
  const displayPatient = titleCaseName(patientName) || "Your patient";
  const displayDoctor = String(doctorName ?? "").trim() || "your doctor";
  const displayClinic = String(clinicName ?? "").trim() || "the clinic";
  const { date, time } = formatConfirmationDateTimeParts(new Date(slotStart));

  const lines = [
    "✅ Appointment confirmed",
    "",
    `Patient: ${displayPatient}`,
    `Doctor: ${displayDoctor}, ${displayClinic}`,
    `Date: ${date}`,
    `Time: ${time}`,
  ];

  if (consultationFee !== null && consultationFee !== undefined && Number.isFinite(Number(consultationFee))) {
    lines.push(`Fee: ₹${Math.round(Number(consultationFee))} (pay at the clinic)`);
  }

  const address = firstNonEmptyAddress(clinicAddress, doctorClinicAddress);
  if (address) {
    lines.push("", `📍 ${address}`);
  }

  return lines.join("\n");
}

/**
 * Prefer the clinic row address, then doctor_profiles.clinic_address.
 * Onboarding writes only the doctor column; settings writes both.
 *
 * @param {string|null|undefined} clinicAddress
 * @param {string|null|undefined} doctorClinicAddress
 * @returns {string}
 */
function firstNonEmptyAddress(clinicAddress, doctorClinicAddress) {
  for (const value of [clinicAddress, doctorClinicAddress]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
