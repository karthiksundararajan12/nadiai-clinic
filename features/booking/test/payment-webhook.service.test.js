import test from "node:test";
import assert from "node:assert/strict";
import { PaymentWebhookService } from "../services/payment-webhook.service.js";
import { CONVERSATION_STATE, RAZORPAY_EVENT_TYPE, BOOKING_CONFIRMED_TEMPLATE_NAME } from "../constants.js";

const CLINIC = { id: "clinic-1", name: "Test Clinic", whatsapp_phone_number_id: "PNID_1" };
const PATIENT = { id: "patient-1", full_name: "Asha Kumar" };
const DOCTOR = { id: "doctor-1", full_name: "Dr. Rao", consultation_fee: 500 };

const APPOINTMENT = {
  id: "appt-1",
  clinic_id: "clinic-1",
  patient_id: "patient-1",
  doctor_id: "doctor-1",
  contact_phone: "919876543210",
  slot_start: "2026-07-06T03:30:00.000Z",
  slot_end: "2026-07-06T04:00:00.000Z",
  status: "confirmed",
  payment_amount: 500,
};

function capturedEventPayload({ paymentId = "pay_1", appointmentId = "appt-1", clinicId = "clinic-1", notes } = {}) {
  return {
    event: RAZORPAY_EVENT_TYPE.PAYMENT_CAPTURED,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          notes: notes !== undefined ? notes : { appointment_id: appointmentId, clinic_id: clinicId },
        },
      },
    },
  };
}

function failedEventPayload({ paymentId = "pay_2", appointmentId = "appt-1", clinicId = "clinic-1", notes } = {}) {
  return {
    event: RAZORPAY_EVENT_TYPE.PAYMENT_FAILED,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          notes: notes !== undefined ? notes : { appointment_id: appointmentId, clinic_id: clinicId },
        },
      },
    },
  };
}

function createFakeAppointmentRepo({ confirmResult = null, releaseResult = null, findResult = null } = {}) {
  const confirmCalls = [];
  const releaseCalls = [];
  return {
    confirmCalls,
    releaseCalls,
    async confirmPayment(clinicId, appointmentId, razorpayPaymentId) {
      confirmCalls.push({ clinicId, appointmentId, razorpayPaymentId });
      return confirmResult;
    },
    async releaseFailedHold(clinicId, appointmentId) {
      releaseCalls.push({ clinicId, appointmentId });
      return releaseResult;
    },
    async findByIdForClinic() {
      return findResult;
    },
  };
}

function createFakeClinicRepo(clinic = CLINIC) {
  return { async findById() { return clinic; } };
}

function createFakePatientRepo(patient = PATIENT) {
  const calls = [];
  return {
    calls,
    async findById(clinicId, patientId) {
      calls.push({ clinicId, patientId });
      return patient;
    },
  };
}

function createFakeDoctorProfileRepo(doctor = DOCTOR) {
  const calls = [];
  return {
    calls,
    async findPrimaryByClinicId(clinicId) {
      calls.push({ clinicId });
      return doctor;
    },
  };
}

function createFakeConversationRepo(row = null) {
  let current = row ? { ...row } : null;
  const updateCalls = [];
  return {
    updateCalls,
    get row() { return current; },
    async find() { return current; },
    async update(id, updates) {
      updateCalls.push({ id, updates });
      current = { ...current, ...updates };
      return current;
    },
  };
}

function createFakeWhatsAppClient() {
  const calls = [];
  const templateCalls = [];
  return {
    calls,
    templateCalls,
    async sendText(phoneNumberId, to, body) {
      calls.push({ phoneNumberId, to, body });
    },
    async sendTemplate(phoneNumberId, to, opts) {
      templateCalls.push({ phoneNumberId, to, opts });
    },
  };
}

function createFakeWebhookEventRepo(isNew = true) {
  const calls = [];
  return {
    calls,
    async recordIfNew(eventId, eventType, payload) {
      calls.push({ eventId, eventType, payload });
      return isNew;
    },
  };
}

function makeService({
  confirmResult = null,
  releaseResult = null,
  findResult = null,
  clinic = CLINIC,
  patient = PATIENT,
  doctor = DOCTOR,
  conversationRow = null,
  isNewEvent = true,
  templatesLive = false,
} = {}) {
  const appointmentRepo = createFakeAppointmentRepo({ confirmResult, releaseResult, findResult });
  const clinicRepo = createFakeClinicRepo(clinic);
  const patientRepo = createFakePatientRepo(patient);
  const doctorProfileRepo = createFakeDoctorProfileRepo(doctor);
  const conversationRepo = createFakeConversationRepo(conversationRow);
  const wa = createFakeWhatsAppClient();
  const eventRepo = createFakeWebhookEventRepo(isNewEvent);
  const service = new PaymentWebhookService(appointmentRepo, clinicRepo, patientRepo, doctorProfileRepo, conversationRepo, wa, eventRepo, { templatesLive });
  return { service, appointmentRepo, clinicRepo, patientRepo, doctorProfileRepo, conversationRepo, wa, eventRepo };
}

function paymentPendingConversationRow(overrides = {}) {
  return {
    id: "conv-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.PAYMENT_PENDING,
    context: { appointmentId: "appt-1" },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// Idempotency
// ─────────────────────────────────────────────────────────────

test("handleEvent: a duplicate event id (replay) is a no-op — never re-runs the transition", async () => {
  const { service, appointmentRepo, eventRepo } = makeService({ isNewEvent: false });

  const result = await service.handleEvent({
    eventId: "evt_1",
    eventType: RAZORPAY_EVENT_TYPE.PAYMENT_CAPTURED,
    payload: capturedEventPayload(),
  });

  assert.equal(result.action, "DUPLICATE_EVENT_SKIPPED");
  assert.equal(eventRepo.calls.length, 1);
  assert.equal(appointmentRepo.confirmCalls.length, 0);
});

test("handleEvent: an unrecognized event type is logged and ignored without crashing", async () => {
  const { service, appointmentRepo } = makeService();

  const result = await service.handleEvent({
    eventId: "evt_1",
    eventType: "refund.processed",
    payload: {},
  });

  assert.equal(result.action, "IGNORED_EVENT_TYPE");
  assert.equal(appointmentRepo.confirmCalls.length, 0);
});

// ─────────────────────────────────────────────────────────────
// payment.captured — happy path
// ─────────────────────────────────────────────────────────────

test("payment.captured: WHATSAPP_TEMPLATES_LIVE=true confirms the appointment, sends the appt_booking_confirmed template, and advances conversation_state to CONFIRMED", async () => {
  const confirmed = { ...APPOINTMENT, status: "confirmed" };
  const row = paymentPendingConversationRow();
  const { service, appointmentRepo, wa, conversationRepo } = makeService({
    confirmResult: confirmed,
    conversationRow: row,
    templatesLive: true,
  });

  const result = await service.handleEvent({
    eventId: "evt_1",
    eventType: RAZORPAY_EVENT_TYPE.PAYMENT_CAPTURED,
    payload: capturedEventPayload({ paymentId: "pay_1" }),
  });

  assert.equal(result.action, "PAYMENT_CONFIRMED");
  assert.equal(result.appointmentId, "appt-1");
  assert.deepEqual(appointmentRepo.confirmCalls[0], {
    clinicId: "clinic-1",
    appointmentId: "appt-1",
    razorpayPaymentId: "pay_1",
  });
  assert.equal(wa.calls.length, 0, "no plain-text sendText for payment.captured anymore");
  assert.equal(wa.templateCalls.length, 1);
  const templateCall = wa.templateCalls[0];
  assert.equal(templateCall.phoneNumberId, "PNID_1");
  assert.equal(templateCall.to, "919876543210");
  assert.equal(templateCall.opts.templateName, BOOKING_CONFIRMED_TEMPLATE_NAME);
  assert.equal(templateCall.opts.languageCode, "en");
  assert.deepEqual(templateCall.opts.bodyParams, [
    "Asha Kumar",  // patient full_name
    "Dr. Rao",     // doctor full_name
    templateCall.opts.bodyParams[2], // formatted slot label — exact string not asserted here
    "500",         // payment_amount
    "Test Clinic", // clinic name
  ]);
  assert.equal(conversationRepo.row.current_state, CONVERSATION_STATE.CONFIRMED);
});

test("payment.captured: WHATSAPP_TEMPLATES_LIVE=false (default) falls back to the plain-text PAYMENT_CONFIRMED message instead of the template, and still advances conversation_state", async () => {
  const confirmed = { ...APPOINTMENT, status: "confirmed" };
  const row = paymentPendingConversationRow();
  const { service, wa, conversationRepo, patientRepo, doctorProfileRepo } = makeService({
    confirmResult: confirmed,
    conversationRow: row,
    // templatesLive defaults to false
  });

  const result = await service.handleEvent({
    eventId: "evt_1",
    eventType: RAZORPAY_EVENT_TYPE.PAYMENT_CAPTURED,
    payload: capturedEventPayload({ paymentId: "pay_1" }),
  });

  assert.equal(result.action, "PAYMENT_CONFIRMED");
  assert.equal(wa.templateCalls.length, 0, "must not call the Meta template API while WHATSAPP_TEMPLATES_LIVE=false");
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].phoneNumberId, "PNID_1");
  assert.equal(wa.calls[0].to, "919876543210");
  assert.match(wa.calls[0].body, /confirmed/i);
  // Stub path never needs patient/doctor names — confirms no wasted lookups.
  assert.equal(patientRepo.calls.length, 0);
  assert.equal(doctorProfileRepo.calls.length, 0);
  assert.equal(conversationRepo.row.current_state, CONVERSATION_STATE.CONFIRMED);
});

test("payment.captured: conversation_state that has already moved on is left untouched", async () => {
  const confirmed = { ...APPOINTMENT, status: "confirmed" };
  const row = paymentPendingConversationRow({ current_state: CONVERSATION_STATE.HUMAN_HANDOFF });
  const { service, conversationRepo } = makeService({ confirmResult: confirmed, conversationRow: row });

  await service.handleEvent({
    eventId: "evt_1",
    eventType: RAZORPAY_EVENT_TYPE.PAYMENT_CAPTURED,
    payload: capturedEventPayload(),
  });

  assert.equal(conversationRepo.updateCalls.length, 0);
  assert.equal(conversationRepo.row.current_state, CONVERSATION_STATE.HUMAN_HANDOFF);
});

// ─────────────────────────────────────────────────────────────
// payment.captured — late/expired payment
// ─────────────────────────────────────────────────────────────

test("payment.captured: a late/expired payment (confirmPayment returns null) is NOT confirmed and sends no notification", async () => {
  const { service, wa, appointmentRepo } = makeService({
    confirmResult: null,
    findResult: { ...APPOINTMENT, status: "cancelled", hold_expires_at: "2020-01-01T00:00:00.000Z" },
  });

  const result = await service.handleEvent({
    eventId: "evt_1",
    eventType: RAZORPAY_EVENT_TYPE.PAYMENT_CAPTURED,
    payload: capturedEventPayload(),
  });

  assert.equal(result.action, "LATE_PAYMENT_NOT_CONFIRMED");
  assert.equal(appointmentRepo.confirmCalls.length, 1);
  assert.equal(wa.calls.length, 0);
  assert.equal(wa.templateCalls.length, 0);
});

// ─────────────────────────────────────────────────────────────
// payment.captured — missing correlation
// ─────────────────────────────────────────────────────────────

test("payment.captured: missing appointment_id/clinic_id in notes is logged, not thrown, and confirms nothing", async () => {
  const { service, appointmentRepo } = makeService();

  const result = await service.handleEvent({
    eventId: "evt_1",
    eventType: RAZORPAY_EVENT_TYPE.PAYMENT_CAPTURED,
    payload: capturedEventPayload({ notes: {} }),
  });

  assert.equal(result.action, "MISSING_CORRELATION");
  assert.equal(appointmentRepo.confirmCalls.length, 0);
});

// ─────────────────────────────────────────────────────────────
// payment.failed — happy path
// ─────────────────────────────────────────────────────────────

test("payment.failed: releases the hold, notifies the contact, and resets conversation_state to START", async () => {
  const released = { ...APPOINTMENT, status: "cancelled", payment_status: "failed" };
  const row = paymentPendingConversationRow();
  const { service, appointmentRepo, wa, conversationRepo } = makeService({ releaseResult: released, conversationRow: row });

  const result = await service.handleEvent({
    eventId: "evt_2",
    eventType: RAZORPAY_EVENT_TYPE.PAYMENT_FAILED,
    payload: failedEventPayload(),
  });

  assert.equal(result.action, "PAYMENT_FAILED_HOLD_RELEASED");
  assert.equal(appointmentRepo.releaseCalls.length, 1);
  assert.equal(wa.calls.length, 1);
  assert.match(wa.calls[0].body, /couldn't be completed/i);
  assert.equal(conversationRepo.row.current_state, CONVERSATION_STATE.START);
});

test("payment.failed: nothing to release (appointment no longer PAYMENT_PENDING) is a clean no-op", async () => {
  const { service, wa, conversationRepo } = makeService({ releaseResult: null, conversationRow: paymentPendingConversationRow() });

  const result = await service.handleEvent({
    eventId: "evt_2",
    eventType: RAZORPAY_EVENT_TYPE.PAYMENT_FAILED,
    payload: failedEventPayload(),
  });

  assert.equal(result.action, "NOTHING_TO_RELEASE");
  assert.equal(wa.calls.length, 0);
  assert.equal(conversationRepo.updateCalls.length, 0);
});

test("payment.failed: missing appointment_id/clinic_id in notes is logged, not thrown, and releases nothing", async () => {
  const { service, appointmentRepo } = makeService();

  const result = await service.handleEvent({
    eventId: "evt_2",
    eventType: RAZORPAY_EVENT_TYPE.PAYMENT_FAILED,
    payload: failedEventPayload({ notes: { appointment_id: "appt-1" } }), // missing clinic_id
  });

  assert.equal(result.action, "MISSING_CORRELATION");
  assert.equal(appointmentRepo.releaseCalls.length, 0);
});

// ─────────────────────────────────────────────────────────────
// Best-effort notification / state-advance failures never bubble up
// ─────────────────────────────────────────────────────────────

test("payment.captured: a missing whatsapp_phone_number_id on the clinic doesn't fail the whole handler", async () => {
  const confirmed = { ...APPOINTMENT, status: "confirmed" };
  const { service } = makeService({ confirmResult: confirmed, clinic: { ...CLINIC, whatsapp_phone_number_id: null } });

  const result = await service.handleEvent({
    eventId: "evt_1",
    eventType: RAZORPAY_EVENT_TYPE.PAYMENT_CAPTURED,
    payload: capturedEventPayload(),
  });

  assert.equal(result.action, "PAYMENT_CONFIRMED");
});

test("payment.captured: no conversation_state row found doesn't fail the whole handler", async () => {
  const confirmed = { ...APPOINTMENT, status: "confirmed" };
  const { service } = makeService({ confirmResult: confirmed, conversationRow: null });

  const result = await service.handleEvent({
    eventId: "evt_1",
    eventType: RAZORPAY_EVENT_TYPE.PAYMENT_CAPTURED,
    payload: capturedEventPayload(),
  });

  assert.equal(result.action, "PAYMENT_CONFIRMED");
});
