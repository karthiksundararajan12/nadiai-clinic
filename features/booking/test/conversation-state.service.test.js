import test from "node:test";
import assert from "node:assert/strict";
import { ConversationStateService } from "../services/conversation-state.service.js";
import { DoctorNotificationService } from "../services/doctor-notification.service.js";
import {
  CONVERSATION_STATE,
  START_MENU_INTENT,
  RESET_COPY,
  RESET_CONFIRM_INTENT,
  CANCEL_COPY,
  CANCEL_CONFIRM_INTENT,
  APPOINTMENT_STATUS,
  PATIENT_REQUESTED_CANCELLATION_REASON,
} from "../constants.js";
import { formatSlotLabel } from "../lib/slot-engine.js";
import { NOTIFICATION_TYPE } from "../services/in-app-notification.service.js";

const CLINIC = { id: "clinic-1", name: "Test Clinic", whatsapp_phone_number_id: "PNID_1" };

function buildMessage(overrides = {}) {
  return {
    phoneNumberId: "PNID_1",
    waMessageId: "wamid.1",
    contactPhone: "919876543210",
    contactName: "Asha",
    type: "text",
    text: "Hi",
    replyId: null,
    replyTitle: null,
    timestamp: "1710000000",
    ...overrides,
  };
}

/** In-memory fake standing in for ConversationStateRepository. */
function createFakeConversationRepo() {
  const rows = new Map();
  let idCounter = 1;

  return {
    rows,
    async find(clinicId, contactPhone) {
      return rows.get(`${clinicId}:${contactPhone}`) ?? null;
    },
    async upsertToState(clinicId, contactPhone, { currentState, context }) {
      const key = `${clinicId}:${contactPhone}`;
      const existing = rows.get(key);
      const row = {
        id: existing?.id ?? `row-${idCounter++}`,
        clinic_id: clinicId,
        contact_phone: contactPhone,
        current_state: currentState,
        context,
        retry_count: 0,
        last_message_at: new Date().toISOString(),
      };
      rows.set(key, row);
      return row;
    },
    async update(id, updates) {
      for (const row of rows.values()) {
        if (row.id === id) {
          Object.assign(row, updates);
          return row;
        }
      }
      throw new Error(`fake repo: row ${id} not found`);
    },
  };
}

/** In-memory fake standing in for WhatsAppClientService. Records every send. */
function createFakeWhatsAppClient() {
  const calls = [];
  return {
    calls,
    async sendText(phoneNumberId, to, body) {
      calls.push({ type: "text", phoneNumberId, to, body });
    },
    async sendInteractiveButtons(phoneNumberId, to, opts) {
      calls.push({ type: "buttons", phoneNumberId, to, opts });
    },
    async sendInteractiveList(phoneNumberId, to, opts) {
      calls.push({ type: "list", phoneNumberId, to, opts });
    },
  };
}

/** In-memory fake standing in for DoctorProfileRepository. */
function createFakeDoctorProfileRepo(doctors = []) {
  return {
    doctors,
    async findNotifiablePhonesByClinicId() {
      return doctors;
    },
  };
}

/**
 * Fake standing in for PatientCollectionService — these tests exercise
 * ConversationStateService's own dispatch/cross-cutting logic (START,
 * idempotency, cancel), not the COLLECTING_PATIENT sub-machine itself
 * (see patient-collection.service.test.js for that).
 */
function createFakePatientCollectionService() {
  const calls = [];
  return {
    calls,
    async enterState({ message, row }) {
      calls.push({ method: "enterState", contactPhone: message.contactPhone });
      return { handled: true, action: "PATIENT_COLLECTION_ENTERED", currentState: row.current_state };
    },
    async handleReply({ message, row }) {
      calls.push({ method: "handleReply", contactPhone: message.contactPhone });
      return { handled: true, action: "PATIENT_COLLECTION_REPLY", currentState: row.current_state };
    },
  };
}

/**
 * Fake standing in for SlotSelectionService — see
 * slot-selection.service.test.js for the real SLOT_SELECTION sub-machine
 * behavior; these tests only check that ConversationStateService dispatches
 * to it correctly.
 */
function createFakeSlotSelectionService() {
  const calls = [];
  return {
    calls,
    async enterState({ message, row }) {
      calls.push({ method: "enterState", contactPhone: message.contactPhone });
      return { handled: true, action: "SLOTS_PRESENTED", currentState: row.current_state };
    },
    async handleReply({ message, row }) {
      calls.push({ method: "handleReply", contactPhone: message.contactPhone });
      return { handled: true, action: "SLOT_SELECTION_REPLY", currentState: row.current_state };
    },
    async enterRescheduleFlow({ message, appointment }) {
      calls.push({
        method: "enterRescheduleFlow",
        contactPhone: message.contactPhone,
        appointmentId: appointment.id,
      });
      return {
        handled: true,
        action: "SLOTS_PRESENTED",
        currentState: CONVERSATION_STATE.SLOT_SELECTION,
      };
    },
  };
}

function createFakeCancelRefundService() {
  const cancelFromPatientMenuCalls = [];
  return {
    cancelFromPatientMenuCalls,
    async cancelFromPatientMenu({ appointmentId, contactPhone }) {
      cancelFromPatientMenuCalls.push({ appointmentId, contactPhone });
      return {
        id: appointmentId,
        status: APPOINTMENT_STATUS.CANCELLED,
        cancellation_reason: "patient_cancelled_menu",
        refund_status: "not_applicable",
        slot_start: "2026-07-12T03:30:00.000Z",
      };
    },
  };
}

/** Real DoctorNotificationService wired to the fake doctor repo + WA client — exercises the actual notify logic, not a re-implementation of it. */
function createDoctorNotifier(doctorRepo, wa) {
  return new DoctorNotificationService(doctorRepo, wa);
}

test("fresh contact: conversation_state is created and the greeting menu is sent", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
  );

  const result = await service.processInboundMessage({ clinic: CLINIC, message: buildMessage() });

  assert.equal(result.action, "GREETING_SENT");
  assert.equal(result.currentState, CONVERSATION_STATE.START);

  const row = repo.rows.get("clinic-1:919876543210");
  assert.equal(row.current_state, CONVERSATION_STATE.START);
  assert.equal(row.context.last_wa_message_id, "wamid.1");
  assert.ok(row.context.menu_sent_at);

  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].type, "list");
  assert.equal(wa.calls[0].to, "919876543210");
  assert.match(wa.calls[0].opts.bodyText, /Test Clinic/);
});

test("expired conversation is reset to START and the greeting is resent", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
  );

  const staleTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.COLLECTING_PATIENT,
    context: { last_wa_message_id: "wamid.old" },
    retry_count: 0,
    last_message_at: staleTimestamp,
  });

  const result = await service.processInboundMessage({ clinic: CLINIC, message: buildMessage({ waMessageId: "wamid.new" }) });

  assert.equal(result.action, "GREETING_SENT");
  const row = repo.rows.get("clinic-1:919876543210");
  assert.equal(row.current_state, CONVERSATION_STATE.START);
  assert.equal(row.context.last_wa_message_id, "wamid.new");
});

test("duplicate wa_message_id is skipped without re-sending anything", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.START,
    context: { last_wa_message_id: "wamid.1", menu_sent_at: new Date().toISOString() },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({ clinic: CLINIC, message: buildMessage({ waMessageId: "wamid.1" }) });

  assert.equal(result.action, "DUPLICATE_SKIPPED");
  assert.equal(wa.calls.length, 0);
});

test("unrecognized reply re-prompts once, then falls back to HUMAN_HANDOFF and notifies the doctor", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const doctorRepo = createFakeDoctorProfileRepo([
    { id: "doc-1", full_name: "Dr. Rao", phone: "+91 98765-00000" },
  ]);
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(doctorRepo, wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.START,
    context: { last_wa_message_id: "wamid.0", menu_sent_at: new Date().toISOString() },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const first = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "huh?" }),
  });
  assert.equal(first.action, "REPROMPTED");
  assert.equal(repo.rows.get("clinic-1:919876543210").retry_count, 1);

  const second = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.2", type: "text", text: "still confused" }),
  });
  assert.equal(second.action, "HUMAN_HANDOFF");
  assert.equal(second.currentState, CONVERSATION_STATE.HUMAN_HANDOFF);

  const listSends = wa.calls.filter((c) => c.type === "list");
  const textSends = wa.calls.filter((c) => c.type === "text");
  assert.equal(listSends.length, 1); // the re-prompt
  assert.equal(textSends.length, 2); // the contact-facing HUMAN_HANDOFF message + the doctor notification

  const contactMessage = textSends.find((c) => c.to === "919876543210");
  assert.ok(contactMessage);

  const doctorMessage = textSends.find((c) => c.to === "919876500000");
  assert.ok(doctorMessage, "doctor phone should be normalized to digits-only and used as the send target");
  assert.equal(doctorMessage.phoneNumberId, "PNID_1"); // sent from the clinic's WABA number
  assert.match(doctorMessage.body, /Asha \(919876543210\)/);
  assert.match(doctorMessage.body, /"still confused"/);
});

test("HUMAN_HANDOFF notifies every doctor on the clinic that has a phone on file", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const doctorRepo = createFakeDoctorProfileRepo([
    { id: "doc-1", full_name: "Dr. Rao", phone: "919876500001" },
    { id: "doc-2", full_name: "Dr. Iyer", phone: "919876500002" },
    { id: "doc-3", full_name: "Dr. No Phone", phone: null },
  ]);
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(doctorRepo, wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.START,
    context: { last_wa_message_id: "wamid.0", menu_sent_at: new Date().toISOString() },
    retry_count: 1, // already at the retry limit — next unrecognized reply triggers handoff
    last_message_at: new Date().toISOString(),
  });

  await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "??" }),
  });

  const doctorSends = wa.calls.filter((c) => c.type === "text" && c.to !== "919876543210");
  assert.equal(doctorSends.length, 2); // only the two doctors with a usable phone
  assert.deepEqual(
    doctorSends.map((c) => c.to).sort(),
    ["919876500001", "919876500002"],
  );
});

test("HUMAN_HANDOFF with no doctor phone on file does not throw and still messages the contact", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo([]), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.START,
    context: { last_wa_message_id: "wamid.0", menu_sent_at: new Date().toISOString() },
    retry_count: 1,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "??" }),
  });

  assert.equal(result.action, "HUMAN_HANDOFF");
  assert.equal(wa.calls.length, 1); // only the contact-facing message, no doctor to notify
  assert.equal(wa.calls[0].to, "919876543210");
});

test("'Book' reply transitions to COLLECTING_PATIENT and hands off to PatientCollectionService.enterState", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const patientSvc = createFakePatientCollectionService();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    patientSvc, createFakeSlotSelectionService(),
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.START,
    context: { last_wa_message_id: "wamid.0", menu_sent_at: new Date().toISOString() },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "list_reply", replyId: START_MENU_INTENT.BOOK }),
  });

  assert.equal(result.action, "PATIENT_COLLECTION_ENTERED");
  assert.equal(result.currentState, CONVERSATION_STATE.COLLECTING_PATIENT);
  assert.equal(repo.rows.get("clinic-1:919876543210").current_state, CONVERSATION_STATE.COLLECTING_PATIENT);
  assert.equal(patientSvc.calls.length, 1);
  assert.equal(patientSvc.calls[0].method, "enterState");
});

test("inbound message while COLLECTING_PATIENT dispatches to PatientCollectionService.handleReply", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const patientSvc = createFakePatientCollectionService();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    patientSvc, createFakeSlotSelectionService(),
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.COLLECTING_PATIENT,
    context: { last_wa_message_id: "wamid.0", collectingPatientStep: "AWAITING_NAME" },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "Rohan Kumar" }),
  });

  assert.equal(result.action, "PATIENT_COLLECTION_REPLY");
  assert.equal(patientSvc.calls.length, 1);
  assert.equal(patientSvc.calls[0].method, "handleReply");
});

test("'restart' from COLLECTING_PATIENT resets to START, greets fresh, skips PatientCollectionService", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const patientSvc = createFakePatientCollectionService();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    patientSvc, createFakeSlotSelectionService(),
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.COLLECTING_PATIENT,
    context: { last_wa_message_id: "wamid.0", collectingPatientStep: "AWAITING_NAME" },
    retry_count: 2,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "  Restart  " }),
  });

  assert.equal(result.action, "RESET_TO_START");
  assert.equal(result.currentState, CONVERSATION_STATE.START);
  assert.equal(patientSvc.calls.length, 0);
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].type, "list");
  assert.equal(wa.calls[0].opts.bodyText, RESET_COPY.ACKNOWLEDGED);

  const row = repo.rows.get("clinic-1:919876543210");
  assert.equal(row.current_state, CONVERSATION_STATE.START);
  assert.equal(row.retry_count, 0);
  assert.equal(row.context.last_wa_message_id, "wamid.1");
  assert.ok(row.context.menu_sent_at);
  assert.equal(row.context.collectingPatientStep, undefined);
});

test("'restart' from SLOT_SELECTION resets to START without touching SlotSelectionService", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const slotSvc = createFakeSlotSelectionService();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), slotSvc,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.SLOT_SELECTION,
    context: {
      last_wa_message_id: "wamid.0",
      slotSelectionStep: "AWAITING_SELECTION",
      offeredSlots: [{ slotStart: "2026-07-06T03:30:00.000Z", slotEnd: "2026-07-06T04:00:00.000Z" }],
    },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "restart" }),
  });

  assert.equal(result.action, "RESET_TO_START");
  assert.equal(result.currentState, CONVERSATION_STATE.START);
  assert.equal(slotSvc.calls.length, 0);
  assert.equal(wa.calls[0].type, "list");
  assert.equal(wa.calls[0].opts.bodyText, RESET_COPY.ACKNOWLEDGED);

  const row = repo.rows.get("clinic-1:919876543210");
  assert.equal(row.current_state, CONVERSATION_STATE.START);
  assert.equal(row.context.offeredSlots, undefined);
});

test("reset keywords are case-insensitive and trim whitespace (e.g. '  Start Over  ')", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const patientSvc = createFakePatientCollectionService();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    patientSvc, createFakeSlotSelectionService(),
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.COLLECTING_PATIENT,
    context: { last_wa_message_id: "wamid.0" },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "  Start Over  " }),
  });

  assert.equal(result.action, "RESET_TO_START");
  assert.equal(patientSvc.calls.length, 0);
});

test("'cancel' from PAYMENT_PENDING with appointment prompts cancel confirmation (not silent wipe)", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointmentRepo = createFakeAppointmentRepo({
    id: "appt-1",
    status: APPOINTMENT_STATUS.PAYMENT_PENDING,
    slot_start: "2026-07-06T03:30:00.000Z",
    patient_id: "patient-1",
    hold_expires_at: new Date(Date.now() + 600_000).toISOString(),
  });
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.PAYMENT_PENDING,
    context: {
      last_wa_message_id: "wamid.0",
      appointmentId: "appt-1",
      paymentLinkId: "plink_1",
    },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "cancel" }),
  });

  assert.equal(result.action, "CANCEL_CONFIRMATION_PROMPTED");
  assert.equal(result.currentState, CONVERSATION_STATE.PAYMENT_PENDING);
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].type, "buttons");
  assert.match(wa.calls[0].opts.bodyText, /cancel this appointment/i);
  assert.equal(appointmentRepo.cancelCalls.length, 0);

  const row = repo.rows.get("clinic-1:919876543210");
  assert.equal(row.current_state, CONVERSATION_STATE.PAYMENT_PENDING);
  assert.equal(row.context.awaitingCancelConfirmation, true);
  assert.equal(row.context.appointmentId, "appt-1");
});

test("PAYMENT_PENDING cancel confirmation YES cancels appointment, notifies doctor, and resets conversation", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointmentRepo = createFakeAppointmentRepo({
    id: "appt-1",
    status: APPOINTMENT_STATUS.PAYMENT_PENDING,
    slot_start: "2026-07-06T03:30:00.000Z",
    patient_id: "patient-1",
    doctor_id: "doctor-1",
    hold_expires_at: new Date(Date.now() + 600_000).toISOString(),
  });
  const notifications = createFakeInAppNotificationService();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
    notifications,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.PAYMENT_PENDING,
    context: {
      last_wa_message_id: "wamid.0",
      appointmentId: "appt-1",
      awaitingCancelConfirmation: true,
    },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({
      waMessageId: "wamid.1",
      type: "button_reply",
      replyId: CANCEL_CONFIRM_INTENT.YES,
    }),
  });

  assert.equal(result.action, "APPOINTMENT_CANCELLED");
  assert.equal(result.currentState, CONVERSATION_STATE.START);
  assert.equal(appointmentRepo.cancelCalls.length, 1);
  assert.equal(appointmentRepo.current.status, APPOINTMENT_STATUS.CANCELLED);
  assert.equal(appointmentRepo.current.cancellation_reason, PATIENT_REQUESTED_CANCELLATION_REASON);
  assert.ok(appointmentRepo.current.cancelled_at);
  assert.equal(appointmentRepo.current.hold_expires_at, null);
  assert.equal(notifications.calls.length, 1);
  assert.equal(notifications.calls[0].appointment.id, "appt-1");

  const row = repo.rows.get("clinic-1:919876543210");
  assert.equal(row.current_state, CONVERSATION_STATE.START);
  assert.equal(row.context.appointmentId, undefined);
  assert.equal(row.context.awaitingCancelConfirmation, undefined);
  assert.match(wa.calls[0].opts.bodyText, /has been cancelled/i);
  assert.match(
    wa.calls[0].opts.bodyText,
    new RegExp(formatSlotLabel(new Date("2026-07-06T03:30:00.000Z")).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("PAYMENT_PENDING reset confirmation YES clears conversation to START without cancelling payment context via appointment APIs", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointmentRepo = createFakeAppointmentRepo({
    id: "appt-1",
    status: APPOINTMENT_STATUS.PAYMENT_PENDING,
    slot_start: "2026-07-06T03:30:00.000Z",
  });
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.PAYMENT_PENDING,
    context: {
      last_wa_message_id: "wamid.0",
      appointmentId: "appt-1",
      awaitingResetConfirmation: true,
    },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({
      waMessageId: "wamid.1",
      type: "button_reply",
      replyId: RESET_CONFIRM_INTENT.YES,
    }),
  });

  assert.equal(result.action, "RESET_TO_START");
  assert.equal(result.currentState, CONVERSATION_STATE.START);
  assert.equal(appointmentRepo.cancelCalls.length, 0, "restart must not cancel the appointment");
  const row = repo.rows.get("clinic-1:919876543210");
  assert.equal(row.current_state, CONVERSATION_STATE.START);
  assert.equal(row.context.appointmentId, undefined);
  assert.equal(row.context.awaitingResetConfirmation, undefined);
  assert.equal(wa.calls[0].opts.bodyText, RESET_COPY.ACKNOWLEDGED);
});

test("PAYMENT_PENDING reset confirmation NO keeps PAYMENT_PENDING and clears the awaiting flag", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.PAYMENT_PENDING,
    context: {
      last_wa_message_id: "wamid.0",
      appointmentId: "appt-1",
      awaitingResetConfirmation: true,
    },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({
      waMessageId: "wamid.1",
      type: "button_reply",
      replyId: RESET_CONFIRM_INTENT.NO,
    }),
  });

  assert.equal(result.action, "RESET_ABORTED");
  assert.equal(result.currentState, CONVERSATION_STATE.PAYMENT_PENDING);
  const row = repo.rows.get("clinic-1:919876543210");
  assert.equal(row.current_state, CONVERSATION_STATE.PAYMENT_PENDING);
  assert.equal(row.context.appointmentId, "appt-1");
  assert.equal(row.context.awaitingResetConfirmation, undefined);
  assert.match(wa.calls[0].body, /keep this booking open/i);
});

test("'Talk to clinic' is recognized but unimplemented — stays in START with a coming-soon reply", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.START,
    context: { last_wa_message_id: "wamid.0", menu_sent_at: new Date().toISOString() },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({
      waMessageId: "wamid.1",
      type: "list_reply",
      replyId: START_MENU_INTENT.TALK_TO_CLINIC,
    }),
  });

  assert.equal(result.action, "UNSUPPORTED_INTENT_ACKNOWLEDGED");
  assert.equal(result.currentState, CONVERSATION_STATE.START);
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].type, "text");
});

// ─────────────────────────────────────────────────────────────
// START menu — Reschedule / Cancel
// ─────────────────────────────────────────────────────────────

function startMenuRow() {
  return {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.START,
    context: { last_wa_message_id: "wamid.0", menu_sent_at: new Date().toISOString() },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  };
}

test("START menu Reschedule: zero CONFIRMED appointments informs and re-shows the menu", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointmentRepo = createFakeAppointmentRepo({ confirmedByContact: [] });
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
  );
  repo.rows.set("clinic-1:919876543210", startMenuRow());

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({
      waMessageId: "wamid.1",
      type: "list_reply",
      replyId: START_MENU_INTENT.RESCHEDULE,
    }),
  });

  assert.equal(result.action, "MENU_RESCHEDULE_NO_APPOINTMENTS");
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].type, "list");
  assert.match(wa.calls[0].opts.bodyText, /don't have an upcoming appointment to reschedule/i);
});

test("START menu Reschedule: exactly one CONFIRMED appointment enters enterRescheduleFlow", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const slotSvc = createFakeSlotSelectionService();
  const appointment = {
    id: "appt-1",
    patient_id: "patient-1",
    doctor_id: "doctor-1",
    status: APPOINTMENT_STATUS.CONFIRMED,
    slot_start: "2026-07-12T03:30:00.000Z",
    patients: { full_name: "Asha Kumar" },
  };
  const appointmentRepo = createFakeAppointmentRepo({ confirmedByContact: [appointment] });
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), slotSvc,
    appointmentRepo,
  );
  repo.rows.set("clinic-1:919876543210", startMenuRow());

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({
      waMessageId: "wamid.1",
      type: "list_reply",
      replyId: START_MENU_INTENT.RESCHEDULE,
    }),
  });

  assert.equal(result.action, "MENU_RESCHEDULE_SLOT_SELECTION");
  assert.equal(result.appointmentId, "appt-1");
  assert.equal(slotSvc.calls.length, 1);
  assert.equal(slotSvc.calls[0].method, "enterRescheduleFlow");
  assert.equal(slotSvc.calls[0].appointmentId, "appt-1");
});

test("START menu Reschedule: multiple CONFIRMED appointments prompts a picker list", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointments = [
    {
      id: "appt-1",
      status: APPOINTMENT_STATUS.CONFIRMED,
      slot_start: "2026-07-12T03:30:00.000Z",
      patients: { full_name: "Asha" },
    },
    {
      id: "appt-2",
      status: APPOINTMENT_STATUS.CONFIRMED,
      slot_start: "2026-07-13T03:30:00.000Z",
      patients: { full_name: "Ravi" },
    },
  ];
  const appointmentRepo = createFakeAppointmentRepo({ confirmedByContact: appointments });
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
  );
  repo.rows.set("clinic-1:919876543210", startMenuRow());

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({
      waMessageId: "wamid.1",
      type: "list_reply",
      replyId: START_MENU_INTENT.RESCHEDULE,
    }),
  });

  assert.equal(result.action, "MENU_APPOINTMENT_PICK_PROMPTED");
  assert.equal(result.appointmentCount, 2);
  assert.equal(wa.calls[0].type, "list");
  assert.match(wa.calls[0].opts.bodyText, /Which appointment would you like to reschedule/i);
  const row = repo.rows.get("clinic-1:919876543210");
  assert.equal(row.context.menuAppointmentAction, "reschedule");
  assert.deepEqual(row.context.menuAppointmentIds, ["appt-1", "appt-2"]);
});

test("START menu appointment pick (reschedule) continues into enterRescheduleFlow", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const slotSvc = createFakeSlotSelectionService();
  const appointment = {
    id: "appt-2",
    patient_id: "patient-2",
    doctor_id: "doctor-1",
    status: APPOINTMENT_STATUS.CONFIRMED,
    slot_start: "2026-07-13T03:30:00.000Z",
    patients: { full_name: "Ravi" },
  };
  const appointmentRepo = createFakeAppointmentRepo({
    confirmedByContact: [
      { id: "appt-1", status: APPOINTMENT_STATUS.CONFIRMED, slot_start: "2026-07-12T03:30:00.000Z" },
      appointment,
    ],
  });
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), slotSvc,
    appointmentRepo,
  );
  repo.rows.set("clinic-1:919876543210", {
    ...startMenuRow(),
    context: {
      last_wa_message_id: "wamid.0",
      menuAppointmentAction: "reschedule",
      menuAppointmentIds: ["appt-1", "appt-2"],
    },
  });

  const { menuAppointmentRowId } = await import("../lib/menu-appointment-list.js");
  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({
      waMessageId: "wamid.1",
      type: "list_reply",
      replyId: menuAppointmentRowId("appt-2"),
    }),
  });

  assert.equal(result.action, "MENU_RESCHEDULE_SLOT_SELECTION");
  assert.equal(slotSvc.calls[0].appointmentId, "appt-2");
});

test("START menu Cancel: exactly one CONFIRMED appointment uses cancelFromPatientMenu", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointment = {
    id: "appt-1",
    status: APPOINTMENT_STATUS.CONFIRMED,
    slot_start: "2026-07-12T03:30:00.000Z",
    payment_amount: 500,
  };
  const appointmentRepo = createFakeAppointmentRepo({ confirmedByContact: [appointment] });
  const cancelRefund = createFakeCancelRefundService();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
    null,
    cancelRefund,
  );
  repo.rows.set("clinic-1:919876543210", startMenuRow());

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({
      waMessageId: "wamid.1",
      type: "list_reply",
      replyId: START_MENU_INTENT.CANCEL,
    }),
  });

  assert.equal(result.action, "MENU_APPOINTMENT_CANCELLED");
  assert.equal(result.appointmentId, "appt-1");
  assert.equal(cancelRefund.cancelFromPatientMenuCalls.length, 1);
  assert.equal(cancelRefund.cancelFromPatientMenuCalls[0].appointmentId, "appt-1");
  assert.equal(wa.calls.some((c) => c.type === "list"), true);
  const row = repo.rows.get("clinic-1:919876543210");
  assert.equal(row.current_state, CONVERSATION_STATE.START);
  assert.ok(row.context.menu_sent_at);
});

test("START menu Cancel: zero CONFIRMED appointments informs and re-shows the menu", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointmentRepo = createFakeAppointmentRepo({ confirmedByContact: [] });
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
  );
  repo.rows.set("clinic-1:919876543210", startMenuRow());

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({
      waMessageId: "wamid.1",
      type: "list_reply",
      replyId: START_MENU_INTENT.CANCEL,
    }),
  });

  assert.equal(result.action, "MENU_CANCEL_NO_APPOINTMENTS");
  assert.match(wa.calls[0].opts.bodyText, /don't have an upcoming appointment to cancel/i);
});

test("inbound message while SLOT_SELECTION dispatches to SlotSelectionService.handleReply", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const slotSvc = createFakeSlotSelectionService();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), slotSvc,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.SLOT_SELECTION,
    context: { last_wa_message_id: "wamid.0", slotSelectionStep: "AWAITING_SELECTION" },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "list_reply", replyId: "booking_slot:2026-07-06T04:30:00.000Z" }),
  });

  assert.equal(result.action, "SLOT_SELECTION_REPLY");
  assert.equal(slotSvc.calls.length, 1);
  assert.equal(slotSvc.calls[0].method, "handleReply");
});

test("a message for a state with no handler yet is safely no-op'd", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.PAYMENT_PENDING,
    context: {},
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({ clinic: CLINIC, message: buildMessage() });

  assert.equal(result.handled, false);
  assert.equal(result.reason, "NO_HANDLER_FOR_STATE");
  assert.equal(wa.calls.length, 0);
});

// ─────────────────────────────────────────────────────────────
// CONFIRMED / REMINDER_SENT inbound fallback
// ─────────────────────────────────────────────────────────────

function createFakeAppointmentRepo(appointmentOrOpts = null) {
  const findCalls = [];
  const cancelCalls = [];
  const findConfirmedByContactCalls = [];

  const isMenuOpts =
    appointmentOrOpts &&
    typeof appointmentOrOpts === "object" &&
    Array.isArray(appointmentOrOpts.confirmedByContact);

  const confirmedByContact = isMenuOpts ? appointmentOrOpts.confirmedByContact : [];
  const byId = new Map(confirmedByContact.map((a) => [a.id, { ...a }]));

  let current = null;
  if (!isMenuOpts && appointmentOrOpts) {
    current = { ...appointmentOrOpts };
    if (current.id) byId.set(current.id, current);
  }

  return {
    findCalls,
    cancelCalls,
    findConfirmedByContactCalls,
    get current() {
      return current;
    },
    async findConfirmedByContact(clinicId, contactPhone) {
      findConfirmedByContactCalls.push({ clinicId, contactPhone });
      if (isMenuOpts) return confirmedByContact.map((a) => ({ ...a }));
      if (!current || current.status !== APPOINTMENT_STATUS.CONFIRMED) return [];
      return [{ ...current }];
    },
    async findByIdForClinic(clinicId, appointmentId) {
      findCalls.push({ clinicId, appointmentId });
      if (byId.has(appointmentId)) return { ...byId.get(appointmentId) };
      if (!current) return null;
      if (current.id && current.id !== appointmentId) return null;
      return { ...current };
    },
    async cancelViaPatientKeyword(clinicId, appointmentId) {
      cancelCalls.push({ clinicId, appointmentId });
      const existing = byId.get(appointmentId) ?? (current?.id === appointmentId ? current : null);
      if (!existing) return null;
      if (
        existing.status !== APPOINTMENT_STATUS.PAYMENT_PENDING &&
        existing.status !== APPOINTMENT_STATUS.CONFIRMED
      ) {
        return null;
      }
      const cancelled = {
        ...existing,
        status: APPOINTMENT_STATUS.CANCELLED,
        cancellation_reason: PATIENT_REQUESTED_CANCELLATION_REASON,
        cancelled_at: new Date().toISOString(),
        hold_expires_at: null,
      };
      byId.set(appointmentId, cancelled);
      current = cancelled;
      return { ...cancelled };
    },
  };
}

function createFakeInAppNotificationService() {
  const calls = [];
  return {
    calls,
    async createAppointmentCancelled(args) {
      calls.push(args);
      return { id: "notif-1", type: NOTIFICATION_TYPE.APPOINTMENT_CANCELLED };
    },
  };
}

test("CONFIRMED: unrecognized message gets a plain-text fallback with appointment date/time", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  // Future slot so "upcoming confirmed" check passes (Mon 6 Jul 2099, 9:00 AM IST).
  const appointmentRepo = createFakeAppointmentRepo({
    id: "appt-1",
    slot_start: "2099-07-06T03:30:00.000Z",
    status: APPOINTMENT_STATUS.CONFIRMED,
  });
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.CONFIRMED,
    context: { last_wa_message_id: "wamid.0", appointmentId: "appt-1" },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "what time is my appointment?" }),
  });

  assert.equal(result.handled, true);
  assert.equal(result.action, "CONFIRMED_FALLBACK_SENT");
  assert.equal(result.currentState, CONVERSATION_STATE.CONFIRMED);
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].type, "text");
  assert.match(wa.calls[0].body, /Mon 6 Jul/);
  assert.match(wa.calls[0].body, /9:00 AM/);
  assert.match(wa.calls[0].body, /confirmed/i);
  assert.match(wa.calls[0].body, /cancel/i);
  assert.match(wa.calls[0].body, /menu/i);
  assert.doesNotMatch(wa.calls[0].body, /was cancelled/i);
  assert.deepEqual(appointmentRepo.findCalls[0], { clinicId: "clinic-1", appointmentId: "appt-1" });
  assert.equal(repo.rows.get("clinic-1:919876543210").current_state, CONVERSATION_STATE.CONFIRMED);
  assert.equal(repo.rows.get("clinic-1:919876543210").context.appointmentId, "appt-1");
});

test("CONFIRMED: reset keywords still short-circuit to START unchanged", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointmentRepo = createFakeAppointmentRepo({
    id: "appt-1",
    slot_start: "2026-07-06T03:30:00.000Z",
  });
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.CONFIRMED,
    context: { last_wa_message_id: "wamid.0", appointmentId: "appt-1" },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "menu" }),
  });

  assert.equal(result.action, "RESET_TO_START");
  assert.equal(result.currentState, CONVERSATION_STATE.START);
  assert.equal(appointmentRepo.findCalls.length, 0, "reset must not look up the appointment for fallback copy");
  assert.equal(repo.rows.get("clinic-1:919876543210").current_state, CONVERSATION_STATE.START);
  assert.equal(wa.calls.some((c) => c.type === "list"), true);
});

test("REMINDER_SENT: unrecognized message gets the same confirmed fallback treatment", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointmentRepo = createFakeAppointmentRepo({
    id: "appt-1",
    slot_start: "2099-07-06T03:30:00.000Z",
    status: APPOINTMENT_STATUS.CONFIRMED,
  });
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: "REMINDER_SENT",
    context: { last_wa_message_id: "wamid.0", appointmentId: "appt-1" },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "hello?" }),
  });

  assert.equal(result.handled, true);
  assert.equal(result.action, "CONFIRMED_FALLBACK_SENT");
  assert.equal(result.currentState, "REMINDER_SENT");
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].type, "text");
  assert.match(wa.calls[0].body, /Mon 6 Jul/);
  assert.match(wa.calls[0].body, /9:00 AM/);
  assert.match(wa.calls[0].body, /confirmed/i);
  assert.equal(repo.rows.get("clinic-1:919876543210").current_state, "REMINDER_SENT");
});

test("CONFIRMED inbound after doctor/no-show cancel: next 'hi' must NOT say confirmed", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  // Conversation_state stays CONFIRMED (doctor-dashboard / no-show cancel do
  // not reset WhatsApp state) but the appointment row is cancelled.
  const appointmentRepo = createFakeAppointmentRepo({
    id: "appt-1",
    slot_start: "2099-07-06T03:30:00.000Z",
    status: APPOINTMENT_STATUS.CANCELLED,
    cancellation_reason: "doctor_cancelled_dashboard",
  });
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.CONFIRMED,
    context: { last_wa_message_id: "wamid.0", appointmentId: "appt-1" },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.hi", type: "text", text: "hi" }),
  });

  assert.equal(result.handled, true);
  assert.equal(result.action, "CONFIRMED_FALLBACK_SENT");
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].type, "text");
  assert.match(wa.calls[0].body, /was cancelled/i);
  assert.doesNotMatch(wa.calls[0].body, /is confirmed/i);
  assert.doesNotMatch(wa.calls[0].body, /Mon 6 Jul/);
  assert.doesNotMatch(wa.calls[0].body, /9:00 AM/);
  assert.deepEqual(appointmentRepo.findCalls[0], {
    clinicId: "clinic-1",
    appointmentId: "appt-1",
  });
});

test("CONFIRMED inbound with past confirmed appointment and no other upcoming: says no upcoming", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointmentRepo = createFakeAppointmentRepo({
    id: "appt-1",
    slot_start: "2020-01-06T03:30:00.000Z",
    status: APPOINTMENT_STATUS.CONFIRMED,
  });
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.CONFIRMED,
    context: { last_wa_message_id: "wamid.0", appointmentId: "appt-1" },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.hi2", type: "text", text: "hi" }),
  });

  assert.equal(result.action, "CONFIRMED_FALLBACK_SENT");
  assert.match(wa.calls[0].body, /don't have an upcoming confirmed appointment/i);
  assert.doesNotMatch(wa.calls[0].body, /is confirmed/i);
});

test("'cancel' from CONFIRMED cancels appointment, notifies doctor, and resets with confirmation copy", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointmentRepo = createFakeAppointmentRepo({
    id: "appt-1",
    status: APPOINTMENT_STATUS.CONFIRMED,
    slot_start: "2026-07-06T03:30:00.000Z",
    patient_id: "patient-1",
    doctor_id: "doctor-1",
  });
  const notifications = createFakeInAppNotificationService();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
    notifications,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.CONFIRMED,
    context: { last_wa_message_id: "wamid.0", appointmentId: "appt-1" },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "cancel" }),
  });

  assert.equal(result.action, "APPOINTMENT_CANCELLED");
  assert.equal(result.appointmentId, "appt-1");
  assert.equal(appointmentRepo.cancelCalls.length, 1);
  assert.equal(appointmentRepo.current.status, APPOINTMENT_STATUS.CANCELLED);
  assert.equal(appointmentRepo.current.cancellation_reason, PATIENT_REQUESTED_CANCELLATION_REASON);
  assert.ok(appointmentRepo.current.cancelled_at);
  assert.equal(notifications.calls.length, 1);
  assert.equal(repo.rows.get("clinic-1:919876543210").current_state, CONVERSATION_STATE.START);
  assert.match(wa.calls[0].opts.bodyText, /has been cancelled/i);
  assert.doesNotMatch(wa.calls[0].opts.bodyText, /let's start over/i);
});

test("'cancel' from REMINDER_SENT (legacy conversation state) cancels confirmed appointment", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointmentRepo = createFakeAppointmentRepo({
    id: "appt-1",
    status: APPOINTMENT_STATUS.CONFIRMED,
    slot_start: "2026-07-06T03:30:00.000Z",
    reminder_24h_sent_at: "2026-07-05T03:15:00.000Z",
  });
  const notifications = createFakeInAppNotificationService();
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
    notifications,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: "REMINDER_SENT",
    context: { last_wa_message_id: "wamid.0", appointmentId: "appt-1" },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "Cancel" }),
  });

  assert.equal(result.action, "APPOINTMENT_CANCELLED");
  assert.equal(appointmentRepo.cancelCalls.length, 1);
  assert.equal(appointmentRepo.current.status, APPOINTMENT_STATUS.CANCELLED);
  assert.equal(appointmentRepo.current.cancellation_reason, PATIENT_REQUESTED_CANCELLATION_REASON);
  assert.ok(appointmentRepo.current.cancelled_at);
  assert.equal(repo.rows.get("clinic-1:919876543210").current_state, CONVERSATION_STATE.START);
});

test("'cancel' with no active appointment falls back to generic reset", async () => {
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointmentRepo = createFakeAppointmentRepo(null);
  const service = new ConversationStateService(
    repo, wa, createDoctorNotifier(createFakeDoctorProfileRepo(), wa),
    createFakePatientCollectionService(), createFakeSlotSelectionService(),
    appointmentRepo,
  );

  repo.rows.set("clinic-1:919876543210", {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.SLOT_SELECTION,
    context: { last_wa_message_id: "wamid.0" },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.1", type: "text", text: "cancel" }),
  });

  assert.equal(result.action, "RESET_TO_START");
  assert.equal(appointmentRepo.cancelCalls.length, 0);
  assert.equal(wa.calls[0].opts.bodyText, RESET_COPY.ACKNOWLEDGED);
  assert.equal(repo.rows.get("clinic-1:919876543210").current_state, CONVERSATION_STATE.START);
});
