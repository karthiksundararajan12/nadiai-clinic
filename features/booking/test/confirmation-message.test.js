/**
 * Guards patient-facing confirmation copy against leaking developer
 * meta-commentary (e.g. "Buttons: None…", "quick-reply") into WhatsApp.
 *
 * Paid confirmations are Meta template `appt_booking_confirmed` (static
 * body on Meta + five bodyParams from PaymentWebhookService) — not LLM.
 * Free confirmations use SLOT_SELECTION_COPY.CONFIRMED plain text.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_CONFIRMED_TEMPLATE_BODY,
  BOOKING_CONFIRMED_TEMPLATE_NAME,
  PAYMENT_WEBHOOK_COPY,
  SLOT_SELECTION_COPY,
} from "../constants.js";
import {
  buildSlotConfirmationMessage,
  resolveConfirmationFeeRupees,
  titleCaseName,
} from "../lib/confirmation-message.js";

const FORBIDDEN_SUBSTRINGS = ["Buttons:", "quick-reply", "quick reply"];

function assertNoMetaCommentary(label, text) {
  assert.equal(typeof text, "string");
  assert.ok(text.trim().length > 0, `${label} must be non-empty`);
  for (const needle of FORBIDDEN_SUBSTRINGS) {
    assert.equal(
      text.toLowerCase().includes(needle.toLowerCase()),
      false,
      `${label} must not contain patient-visible meta-commentary "${needle}"`,
    );
  }
}

test("BOOKING_CONFIRMED_TEMPLATE_BODY is the clean Meta body (no button commentary)", () => {
  assert.equal(BOOKING_CONFIRMED_TEMPLATE_NAME, "appt_booking_confirmed");
  assertNoMetaCommentary("BOOKING_CONFIRMED_TEMPLATE_BODY", BOOKING_CONFIRMED_TEMPLATE_BODY);
  assert.match(BOOKING_CONFIRMED_TEMPLATE_BODY, /arrive 10 minutes early/i);
  assert.match(BOOKING_CONFIRMED_TEMPLATE_BODY, /\{\{1\}\}/);
  assert.match(BOOKING_CONFIRMED_TEMPLATE_BODY, /\{\{5\}\}/);
});

test("PAYMENT_WEBHOOK_COPY.PAYMENT_CONFIRMED plain-text fallback has no button commentary", () => {
  assertNoMetaCommentary("PAYMENT_CONFIRMED", PAYMENT_WEBHOOK_COPY.PAYMENT_CONFIRMED);
});

test("SLOT_SELECTION_COPY.CONFIRMED (fee-free path) has no button commentary", () => {
  assertNoMetaCommentary("SLOT_SELECTION CONFIRMED", SLOT_SELECTION_COPY.CONFIRMED);
});

test("SLOT_SELECTION_COPY.PAY_AT_CLINIC_CONFIRMED has no payment-received wording and no button commentary", () => {
  assertNoMetaCommentary("PAY_AT_CLINIC_CONFIRMED", SLOT_SELECTION_COPY.PAY_AT_CLINIC_CONFIRMED);
  assert.match(SLOT_SELECTION_COPY.PAY_AT_CLINIC_CONFIRMED, /pay at the clinic/i);
  assert.equal(/payment received/i.test(SLOT_SELECTION_COPY.PAY_AT_CLINIC_CONFIRMED), false);
});

const SLOT_START = "2026-07-06T03:30:00.000Z"; // Monday 6 Jul 2026, 9:00 AM IST

test("buildSlotConfirmationMessage: title-cases the patient and quotes the doctor fee", () => {
  const body = buildSlotConfirmationMessage({
    patientName: "asha KAPOOR",
    doctorName: "Dr. Test",
    clinicName: "Test Clinic",
    slotStart: SLOT_START,
    consultationFee: resolveConfirmationFeeRupees({
      doctor: { consultation_fee: "750.00" },
    }),
    clinicAddress: "  12 MG Road, Bengaluru  ",
  });

  assert.equal(body, [
    "✅ Appointment confirmed",
    "",
    "Patient: Asha Kapoor",
    "Doctor: Dr. Test, Test Clinic",
    "Date: Monday, 6 Jul 2026",
    "Time: 9:00 AM",
    "Fee: ₹750 (pay at the clinic)",
    "",
    "📍 12 MG Road, Bengaluru",
  ].join("\n"));
  assert.equal(body.includes("—"), false);
  assert.equal(body.includes("750.00"), false);
});

test("buildSlotConfirmationMessage: uses doctor clinic_address when the clinic row address is empty", () => {
  const body = buildSlotConfirmationMessage({
    patientName: "asha",
    doctorName: "Dr. Rao",
    clinicName: "Rao Clinic",
    slotStart: SLOT_START,
    consultationFee: 0,
    clinicAddress: "   ",
    doctorClinicAddress: "42 Brigade Road",
  });

  assert.match(body, /Patient: Asha/);
  assert.match(body, /Fee: ₹0 \(pay at the clinic\)/);
  assert.match(body, /📍 42 Brigade Road/);
});

test("buildSlotConfirmationMessage: omits the address line when both addresses are empty", () => {
  const body = buildSlotConfirmationMessage({
    patientName: "Asha Kapoor",
    doctorName: "Dr. Test",
    clinicName: "Test Clinic",
    slotStart: SLOT_START,
    consultationFee: 500,
    clinicAddress: "",
    doctorClinicAddress: null,
  });

  assert.equal(body.includes("📍"), false);
  assert.match(body, /Fee: ₹500 \(pay at the clinic\)$/);
  assert.equal(body.includes("RESCHEDULE"), false);
  assert.equal(body.includes("CANCEL"), false);
});

test("titleCaseName: leaves a blank name blank", () => {
  assert.equal(titleCaseName("   "), "");
  assert.equal(titleCaseName(null), "");
});
