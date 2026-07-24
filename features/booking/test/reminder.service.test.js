import test from "node:test";
import assert from "node:assert/strict";
import { ReminderService } from "../services/reminder.service.js";
import {
  REMINDER_KIND,
  REMINDER_SENT_AT_COLUMN,
  REMINDER_WINDOW_MINUTES,
  REMINDER_TEMPLATE_NAME,
  REMINDER_REPLY_ACTION,
  REMINDER_COPY,
  APPOINTMENT_STATUS,
} from "../constants.js";
import { reminderReplyId } from "../lib/reminder-reply.js";

const CLINIC = Object.freeze({
  id: "clinic-1",
  name: "Test Clinic",
  whatsapp_phone_number_id: "PNID_1",
  reminder_24h_offset_minutes: 1440,
  reminder_2h_offset_minutes: 120,
});

function buildAppointment(overrides = {}) {
  return {
    id: "appt-1",
    clinic_id: "clinic-1",
    patient_id: "patient-1",
    contact_phone: "919876543210",
    slot_start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    slot_end: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
    status: APPOINTMENT_STATUS.CONFIRMED,
    ...overrides,
  };
}

function buildMessage(overrides = {}) {
  return {
    phoneNumberId: "PNID_1",
    waMessageId: "wamid.1",
    contactPhone: "919876543210",
    contactName: "Asha",
    type: "button_reply",
    text: null,
    replyId: null,
    replyTitle: null,
    timestamp: "1710000000",
    ...overrides,
  };
}

/**
 * @param {object} opts
 * @param {object[]} [opts.clinics]
 * @param {(clinicId: string, column: string, fromIso: string, toIso: string) => Promise<object[]>|object[]} [opts.findDueForReminderImpl]
 * @param {(clinicId: string, appointmentId: string, column: string) => Promise<object|null>|object|null} [opts.claimReminderImpl]
 * @param {object[]} [opts.completeExpiredConfirmedResult]
 */
function createFakeRepos({
  clinics = [CLINIC],
  findDueForReminderImpl = null,
  claimReminderImpl = null,
  completeExpiredConfirmedResult = [],
  findByIdForClinicImpl = null,
  findByIdImpl = null,
  cancelViaReminderReplyImpl = null,
  requestRescheduleViaReminderReplyImpl = null,
  remindersEnabledByClinic = true,
} = {}) {
  const calls = {
    findDueForReminder: [],
    claimReminder: [],
    completeExpiredConfirmed: [],
    findByIdForClinic: [],
    findById: [],
    cancelViaReminderReply: [],
    requestRescheduleViaReminderReply: [],
    isRemindersEnabledForClinic: [],
  };

  const clinicRepository = {
    async findAllWithWhatsAppConfigured() {
      return clinics;
    },
    async findById(clinicId) {
      return clinics.find((c) => c.id === clinicId) ?? null;
    },
  };

  const appointmentRepository = {
    async findDueForReminder(clinicId, column, fromIso, toIso) {
      calls.findDueForReminder.push({ clinicId, column, fromIso, toIso });
      if (findDueForReminderImpl) return findDueForReminderImpl(clinicId, column, fromIso, toIso);
      return [];
    },
    async claimReminder(clinicId, appointmentId, column) {
      calls.claimReminder.push({ clinicId, appointmentId, column });
      if (claimReminderImpl) return claimReminderImpl(clinicId, appointmentId, column);
      return null;
    },
    async completeExpiredConfirmed(clinicId, nowIso) {
      calls.completeExpiredConfirmed.push({ clinicId, nowIso });
      return completeExpiredConfirmedResult;
    },
    async findByIdForClinic(clinicId, appointmentId) {
      calls.findByIdForClinic.push({ clinicId, appointmentId });
      if (findByIdForClinicImpl) return findByIdForClinicImpl(clinicId, appointmentId);
      return buildAppointment({ id: appointmentId });
    },
    async findById(appointmentId) {
      calls.findById.push({ appointmentId });
      if (findByIdImpl) return findByIdImpl(appointmentId);
      return buildAppointment({ id: appointmentId });
    },
    async cancelViaReminderReply(clinicId, appointmentId) {
      calls.cancelViaReminderReply.push({ clinicId, appointmentId });
      if (cancelViaReminderReplyImpl) return cancelViaReminderReplyImpl(clinicId, appointmentId);
      return buildAppointment({ id: appointmentId, status: APPOINTMENT_STATUS.CANCELLED });
    },
    async requestRescheduleViaReminderReply(clinicId, appointmentId) {
      calls.requestRescheduleViaReminderReply.push({ clinicId, appointmentId });
      if (requestRescheduleViaReminderReplyImpl) return requestRescheduleViaReminderReplyImpl(clinicId, appointmentId);
      return buildAppointment({ id: appointmentId, status: APPOINTMENT_STATUS.RESCHEDULE_REQUESTED });
    },
  };

  const patientRepository = {
    async findById(_clinicId, patientId) {
      return { id: patientId, full_name: "Asha Kumar" };
    },
  };

  const doctorProfileRepository = {
    async isRemindersEnabledForClinic(clinicId) {
      calls.isRemindersEnabledForClinic.push(clinicId);
      if (typeof remindersEnabledByClinic === "function") {
        return remindersEnabledByClinic(clinicId);
      }
      return remindersEnabledByClinic;
    },
  };

  return { calls, clinicRepository, appointmentRepository, patientRepository, doctorProfileRepository };
}

function createFakeWhatsAppClient() {
  const sendTextCalls = [];
  const sendTemplateCalls = [];
  return {
    sendTextCalls,
    sendTemplateCalls,
    async sendText(phoneNumberId, toPhone, body) {
      sendTextCalls.push({ phoneNumberId, toPhone, body });
    },
    async sendTemplate(phoneNumberId, toPhone, opts) {
      sendTemplateCalls.push({ phoneNumberId, toPhone, opts });
    },
  };
}

function createFakeDoctorNotifier() {
  const calls = [];
  return {
    calls,
    async notifyHandoff(params) {
      calls.push(params);
    },
  };
}

function createFakeInAppNotificationService() {
  const createAppointmentCancelledCalls = [];
  const createAppointmentRescheduledCalls = [];
  return {
    createAppointmentCancelledCalls,
    createAppointmentRescheduledCalls,
    async createAppointmentCancelled(args) {
      createAppointmentCancelledCalls.push(args);
      return { id: "notif-1", ...args };
    },
    async createAppointmentRescheduled(args) {
      createAppointmentRescheduledCalls.push(args);
      return { id: "notif-2", ...args };
    },
  };
}

function createFakeSlotSelectionService() {
  const enterRescheduleFlowCalls = [];
  return {
    enterRescheduleFlowCalls,
    async enterRescheduleFlow(params) {
      enterRescheduleFlowCalls.push(params);
      return {
        handled: true,
        action: "SLOTS_PRESENTED",
        currentState: "SLOT_SELECTION",
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────
// runReminderSweep — query layer (window computation)
// ─────────────────────────────────────────────────────────────

test("runReminderSweep: queries each clinic for both 24h and 2h kinds with a window ending at now + that clinic's offset", async () => {
  const { calls, clinicRepository, appointmentRepository, patientRepository } = createFakeRepos();
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier);

  const before = Date.now();
  await service.runReminderSweep();
  const after = Date.now();

  assert.equal(calls.findDueForReminder.length, 2, "expected one query per REMINDER_KIND for the one configured clinic");

  const h24Call = calls.findDueForReminder.find((c) => c.column === REMINDER_SENT_AT_COLUMN[REMINDER_KIND.H24]);
  const h2Call = calls.findDueForReminder.find((c) => c.column === REMINDER_SENT_AT_COLUMN[REMINDER_KIND.H2]);
  assert.ok(h24Call);
  assert.ok(h2Call);

  // windowEnd = now + offset; windowStart = windowEnd - REMINDER_WINDOW_MINUTES.
  const h24WindowEnd = Date.parse(h24Call.toIso);
  const h24WindowStart = Date.parse(h24Call.fromIso);
  assert.ok(h24WindowEnd >= before + 1440 * 60_000 && h24WindowEnd <= after + 1440 * 60_000);
  assert.equal(h24WindowEnd - h24WindowStart, REMINDER_WINDOW_MINUTES * 60_000);

  const h2WindowEnd = Date.parse(h2Call.toIso);
  const h2WindowStart = Date.parse(h2Call.fromIso);
  assert.ok(h2WindowEnd >= before + 120 * 60_000 && h2WindowEnd <= after + 120 * 60_000);
  assert.equal(h2WindowEnd - h2WindowStart, REMINDER_WINDOW_MINUTES * 60_000);
});

test("runReminderSweep: falls back to the default offset when a clinic row predates the offset columns", async () => {
  const clinicMissingOffsets = { ...CLINIC, reminder_24h_offset_minutes: null, reminder_2h_offset_minutes: undefined };
  const { calls, clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({ clinics: [clinicMissingOffsets] });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier);

  const before = Date.now();
  await service.runReminderSweep();

  const h24Call = calls.findDueForReminder.find((c) => c.column === REMINDER_SENT_AT_COLUMN[REMINDER_KIND.H24]);
  const h24WindowEnd = Date.parse(h24Call.toIso);
  assert.ok(Math.abs(h24WindowEnd - (before + 1440 * 60_000)) < 5000, "should default to 1440 minutes (24h)");
});

test("runReminderSweep: skips reminder queries when reminders_enabled is false for the clinic", async () => {
  const { calls, clinicRepository, appointmentRepository, patientRepository, doctorProfileRepository } =
    createFakeRepos({
      remindersEnabledByClinic: false,
      findDueForReminderImpl: () => {
        throw new Error("should not query when reminders are disabled");
      },
    });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(
    clinicRepository,
    appointmentRepository,
    patientRepository,
    wa,
    doctorNotifier,
    { doctorProfileRepository, templatesLive: true },
  );

  const summary = await service.runReminderSweep();

  assert.deepEqual(calls.isRemindersEnabledForClinic, ["clinic-1"]);
  assert.equal(calls.findDueForReminder.length, 0);
  assert.equal(summary.remindersSent, 0);
  assert.equal(calls.completeExpiredConfirmed.length, 1, "no-response timeout still runs");
});

// ─────────────────────────────────────────────────────────────
// runReminderSweep — claim-then-send + WHATSAPP_TEMPLATES_LIVE gate
// ─────────────────────────────────────────────────────────────

test("runReminderSweep: WHATSAPP_TEMPLATES_LIVE=false (default) never calls the Meta API, even when a reminder is due", async () => {
  const dueAppointment = buildAppointment();
  const { clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({
    findDueForReminderImpl: () => [dueAppointment],
    claimReminderImpl: (clinicId, appointmentId, column) => ({ ...dueAppointment, [column]: new Date().toISOString() }),
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier);

  const summary = await service.runReminderSweep();

  assert.equal(wa.sendTemplateCalls.length, 0, "stub mode must never call sendTemplate");
  assert.equal(summary.remindersSent, 2, "both 24h and 2h reminders 'sent' (logged) for the one due appointment");
});

test("runReminderSweep: WHATSAPP_TEMPLATES_LIVE=true calls sendTemplate with the right template name, recipient, and button payloads", async () => {
  const dueAppointment = buildAppointment();
  const { clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({
    findDueForReminderImpl: (clinicId, column) => [dueAppointment],
    claimReminderImpl: (clinicId, appointmentId, column) => ({ ...dueAppointment, [column]: new Date().toISOString() }),
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier, {
    templatesLive: true,
  });

  await service.runReminderSweep();

  assert.equal(wa.sendTemplateCalls.length, 2);
  const h24Send = wa.sendTemplateCalls.find((c) => c.opts.templateName === REMINDER_TEMPLATE_NAME[REMINDER_KIND.H24]);
  assert.ok(h24Send);
  assert.equal(h24Send.phoneNumberId, CLINIC.whatsapp_phone_number_id);
  assert.equal(h24Send.toPhone, dueAppointment.contact_phone);
  assert.deepEqual(h24Send.opts.bodyParams, ["Asha Kumar", "Test Clinic", h24Send.opts.bodyParams[2]]);
  assert.equal(h24Send.opts.buttonPayloads.length, 3);
  assert.equal(h24Send.opts.buttonPayloads[0].payload, reminderReplyId(REMINDER_REPLY_ACTION.CONFIRM, dueAppointment.id));
  assert.equal(h24Send.opts.buttonPayloads[1].payload, reminderReplyId(REMINDER_REPLY_ACTION.CANCEL, dueAppointment.id));
  assert.equal(h24Send.opts.buttonPayloads[2].payload, reminderReplyId(REMINDER_REPLY_ACTION.RESCHEDULE, dueAppointment.id));
});

test("runReminderSweep: a reminder already claimed by a concurrent run is skipped, not double-sent", async () => {
  const dueAppointment = buildAppointment();
  const { clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({
    findDueForReminderImpl: () => [dueAppointment],
    claimReminderImpl: () => null, // simulates the atomic UPDATE matching zero rows
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier, {
    templatesLive: true,
  });

  const summary = await service.runReminderSweep();

  assert.equal(wa.sendTemplateCalls.length, 0);
  assert.equal(summary.remindersSent, 0);
  assert.equal(summary.remindersFailed, 2, "both kinds found the appointment already claimed");
});

test("runReminderSweep: a query failure for one clinic doesn't stop the sweep from processing the next clinic", async () => {
  const clinicA = { ...CLINIC, id: "clinic-A" };
  const clinicB = { ...CLINIC, id: "clinic-B" };
  const dueForB = buildAppointment({ id: "appt-b", clinic_id: "clinic-B" });

  const { clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({
    clinics: [clinicA, clinicB],
    findDueForReminderImpl: (clinicId) => {
      if (clinicId === "clinic-A") throw new Error("simulated DB error for clinic A");
      return [dueForB];
    },
    claimReminderImpl: (clinicId, appointmentId, column) => ({ ...dueForB, [column]: new Date().toISOString() }),
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier);

  const summary = await service.runReminderSweep();

  assert.equal(summary.clinicsScanned, 2);
  assert.equal(summary.remindersSent, 2, "clinic B's reminders (24h + 2h) still went out despite clinic A's failure");
});

// ─────────────────────────────────────────────────────────────
// runReminderSweep — no-response timeout (step 5)
// ─────────────────────────────────────────────────────────────

test("runReminderSweep: includes completeExpiredConfirmed's count in the summary", async () => {
  const { clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({
    completeExpiredConfirmedResult: [{ id: "appt-old-1" }, { id: "appt-old-2" }],
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier);

  const summary = await service.runReminderSweep();

  assert.equal(summary.completedNoResponse, 2);
});

// ─────────────────────────────────────────────────────────────
// handleQuickReply — Confirm
// ─────────────────────────────────────────────────────────────

test("handleQuickReply Confirm: acknowledges without mutating the appointment", async () => {
  const appointment = buildAppointment();
  const { calls, clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({
    findByIdForClinicImpl: () => appointment,
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier);

  const message = buildMessage({ replyId: reminderReplyId(REMINDER_REPLY_ACTION.CONFIRM, appointment.id) });
  const result = await service.handleQuickReply({ clinic: CLINIC, message });

  assert.equal(result.action, "REMINDER_CONFIRMED");
  assert.equal(calls.cancelViaReminderReply.length, 0);
  assert.equal(calls.requestRescheduleViaReminderReply.length, 0);
  assert.equal(wa.sendTextCalls.length, 1);
  assert.equal(wa.sendTextCalls[0].body, REMINDER_COPY.CONFIRM_ACK);
});

test("handleQuickReply Confirm: an appointment no longer CONFIRMED gets the stale-reply message instead", async () => {
  const appointment = buildAppointment({ status: APPOINTMENT_STATUS.CANCELLED });
  const { clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({
    findByIdForClinicImpl: () => appointment,
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier);

  const message = buildMessage({ replyId: reminderReplyId(REMINDER_REPLY_ACTION.CONFIRM, appointment.id) });
  const result = await service.handleQuickReply({ clinic: CLINIC, message });

  assert.equal(result.action, "STALE_APPOINTMENT");
  assert.equal(wa.sendTextCalls[0].body, REMINDER_COPY.STALE_OR_UNKNOWN_REPLY);
});

// ─────────────────────────────────────────────────────────────
// handleQuickReply — Cancel
// ─────────────────────────────────────────────────────────────

test("handleQuickReply Cancel: cancels the appointment, acknowledges, and notifies the doctor in-app", async () => {
  const appointment = buildAppointment();
  const cancelled = {
    ...appointment,
    status: APPOINTMENT_STATUS.CANCELLED,
    cancelled_at: new Date().toISOString(),
    cancellation_reason: "patient_cancelled_via_reminder",
    hold_expires_at: null,
  };
  const { calls, clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({
    findByIdForClinicImpl: () => appointment,
    cancelViaReminderReplyImpl: () => cancelled,
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const inApp = createFakeInAppNotificationService();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier, {
    inAppNotificationService: inApp,
  });

  const message = buildMessage({ replyId: reminderReplyId(REMINDER_REPLY_ACTION.CANCEL, appointment.id) });
  const result = await service.handleQuickReply({ clinic: CLINIC, message });

  assert.equal(result.action, "CANCELLED");
  assert.equal(calls.cancelViaReminderReply.length, 1);
  assert.equal(calls.cancelViaReminderReply[0].appointmentId, appointment.id);
  assert.ok(wa.sendTextCalls[0].body.startsWith("Your appointment on"));
  assert.equal(inApp.createAppointmentCancelledCalls.length, 1);
  assert.equal(inApp.createAppointmentCancelledCalls[0].appointment.id, appointment.id);
});

test("handleQuickReply Cancel: replaying against an already-resolved appointment is a no-op with a stale-reply message", async () => {
  const appointment = buildAppointment();
  const { clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({
    findByIdForClinicImpl: () => appointment,
    cancelViaReminderReplyImpl: () => null,
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier);

  const message = buildMessage({ replyId: reminderReplyId(REMINDER_REPLY_ACTION.CANCEL, appointment.id) });
  const result = await service.handleQuickReply({ clinic: CLINIC, message });

  assert.equal(result.action, "STALE_APPOINTMENT");
  assert.equal(wa.sendTextCalls[0].body, REMINDER_COPY.STALE_OR_UNKNOWN_REPLY);
});

// ─────────────────────────────────────────────────────────────
// handleQuickReply — Reschedule
// ─────────────────────────────────────────────────────────────

test("handleQuickReply Reschedule: enters SLOT_SELECTION self-serve flow without marking RESCHEDULE_REQUESTED", async () => {
  const appointment = buildAppointment({ doctor_id: "doc-1" });
  const { calls, clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({
    findByIdForClinicImpl: () => appointment,
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const slotSelection = createFakeSlotSelectionService();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier, {
    slotSelectionService: slotSelection,
  });

  const message = buildMessage({ replyId: reminderReplyId(REMINDER_REPLY_ACTION.RESCHEDULE, appointment.id) });
  const result = await service.handleQuickReply({ clinic: CLINIC, message });

  assert.equal(result.action, "RESCHEDULE_SLOT_SELECTION");
  assert.equal(calls.requestRescheduleViaReminderReply.length, 0);
  assert.equal(slotSelection.enterRescheduleFlowCalls.length, 1);
  assert.equal(slotSelection.enterRescheduleFlowCalls[0].appointment.id, appointment.id);
  assert.equal(slotSelection.enterRescheduleFlowCalls[0].patientName, "Asha Kumar");
  assert.equal(doctorNotifier.calls.length, 0);
});

test("handleQuickReply Reschedule: stale (non-CONFIRMED) appointment gets the stale-reply message", async () => {
  const appointment = buildAppointment({ status: APPOINTMENT_STATUS.CANCELLED });
  const { clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({
    findByIdForClinicImpl: () => appointment,
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const slotSelection = createFakeSlotSelectionService();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier, {
    slotSelectionService: slotSelection,
  });

  const message = buildMessage({ replyId: reminderReplyId(REMINDER_REPLY_ACTION.RESCHEDULE, appointment.id) });
  const result = await service.handleQuickReply({ clinic: CLINIC, message });

  assert.equal(result.action, "STALE_APPOINTMENT");
  assert.equal(slotSelection.enterRescheduleFlowCalls.length, 0);
  assert.equal(wa.sendTextCalls[0].body, REMINDER_COPY.STALE_OR_UNKNOWN_REPLY);
});

// ─────────────────────────────────────────────────────────────
// handleQuickReply — unknown / stale appointment
// ─────────────────────────────────────────────────────────────

test("handleQuickReply: an appointment that no longer exists gets the stale-reply message, not a crash", async () => {
  const { clinicRepository, appointmentRepository, patientRepository } = createFakeRepos({
    findByIdForClinicImpl: () => null,
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier);

  const message = buildMessage({ replyId: reminderReplyId(REMINDER_REPLY_ACTION.CONFIRM, "missing-appt") });
  const result = await service.handleQuickReply({ clinic: CLINIC, message });

  assert.equal(result.action, "STALE_APPOINTMENT");
  assert.equal(wa.sendTextCalls[0].body, REMINDER_COPY.STALE_OR_UNKNOWN_REPLY);
});

test("handleQuickReply: a non-reminder replyId is rejected defensively instead of acting on it", async () => {
  const { clinicRepository, appointmentRepository, patientRepository } = createFakeRepos();
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier);

  const message = buildMessage({ replyId: "booking_slot:2026-07-06T03:30:00.000Z" });
  const result = await service.handleQuickReply({ clinic: CLINIC, message });

  assert.equal(result.handled, false);
  assert.equal(result.action, "NOT_A_REMINDER_REPLY");
  assert.equal(wa.sendTextCalls.length, 0);
});

// ─────────────────────────────────────────────────────────────
// sendReminderNow — force / on-demand (bypasses time window)
// ─────────────────────────────────────────────────────────────

test("sendReminderNow: claims and sends a CONFIRMED appointment outside the cron window", async () => {
  const appointment = buildAppointment({
    // Far outside any T-2h window — force path must still send.
    slot_start: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const { calls, clinicRepository, appointmentRepository, patientRepository, doctorProfileRepository } = createFakeRepos({
    findByIdImpl: () => appointment,
    claimReminderImpl: () => appointment,
  });
  const wa = createFakeWhatsAppClient();
  const doctorNotifier = createFakeDoctorNotifier();
  const service = new ReminderService(
    clinicRepository, appointmentRepository, patientRepository, wa, doctorNotifier,
    { templatesLive: true, doctorProfileRepository },
  );

  const result = await service.sendReminderNow({ appointmentId: appointment.id, kind: REMINDER_KIND.H2 });

  assert.equal(result.sent, true);
  assert.equal(result.skippedReason, null);
  assert.equal(calls.findDueForReminder.length, 0, "force path must not use the due-window query");
  assert.equal(calls.claimReminder.length, 1);
  assert.equal(calls.claimReminder[0].column, REMINDER_SENT_AT_COLUMN[REMINDER_KIND.H2]);
  assert.equal(wa.sendTemplateCalls.length, 1);
  assert.equal(wa.sendTemplateCalls[0].opts.templateName, REMINDER_TEMPLATE_NAME[REMINDER_KIND.H2]);
});

test("sendReminderNow: skips non-CONFIRMED appointments without claiming", async () => {
  const appointment = buildAppointment({ status: APPOINTMENT_STATUS.PAYMENT_PENDING });
  const { calls, clinicRepository, appointmentRepository, patientRepository, doctorProfileRepository } = createFakeRepos({
    findByIdImpl: () => appointment,
  });
  const wa = createFakeWhatsAppClient();
  const service = new ReminderService(
    clinicRepository, appointmentRepository, patientRepository, wa, createFakeDoctorNotifier(),
    { templatesLive: true, doctorProfileRepository },
  );

  const result = await service.sendReminderNow({ appointmentId: appointment.id, kind: REMINDER_KIND.H2 });

  assert.equal(result.sent, false);
  assert.equal(result.skippedReason, "NOT_CONFIRMED");
  assert.equal(calls.claimReminder.length, 0);
  assert.equal(wa.sendTemplateCalls.length, 0);
});

test("sendReminderNow: rejects an unknown kind", async () => {
  const { clinicRepository, appointmentRepository, patientRepository } = createFakeRepos();
  const service = new ReminderService(
    clinicRepository, appointmentRepository, patientRepository,
    createFakeWhatsAppClient(), createFakeDoctorNotifier(),
  );

  await assert.rejects(
    () => service.sendReminderNow({ appointmentId: "appt-1", kind: "1h" }),
    (err) => err?.code === "INVALID_REMINDER_KIND",
  );
});
