/**
 * Regression tests for the inbound-webhook idempotency claim.
 *
 * Incident (2026-09-21): after a slot was confirmed, the bot re-sent the
 * same "Your appointment ... is confirmed. Reply 'cancel' to cancel or
 * 'menu' to see options." reply three times over ~70 minutes with no new
 * inbound message from the patient, then reset itself to START with an
 * unprompted "No problem, let's start over."
 *
 * Both symptoms are one cause: Meta redelivering webhooks that were only
 * deduped against conversation_state.context.last_wa_message_id, which
 * remembers exactly one wamid per contact. These tests drive the same
 * (claim -> dispatch) sequence the webhook route runs, so they fail if
 * either half of the fix regresses.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { claimInboundMessage } from "../lib/inbound-dedupe.js";
import { ConversationStateService } from "../services/conversation-state.service.js";
import {
  CONVERSATION_STATE,
  CONFIRMED_INBOUND_COPY,
  RESET_COPY,
  APPOINTMENT_STATUS,
} from "../constants.js";

const CLINIC = { id: "clinic-1", name: "Test Clinic", whatsapp_phone_number_id: "PNID_1" };
const CONTACT = "919876543210";

function buildMessage(overrides = {}) {
  return {
    phoneNumberId: "PNID_1",
    waMessageId: "wamid.AAA",
    contactPhone: CONTACT,
    contactName: "Asha",
    type: "text",
    text: "thanks!",
    replyId: null,
    replyTitle: null,
    timestamp: "1710000000",
    ...overrides,
  };
}

const silentLog = {
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLog;
  },
};

/**
 * Fake standing in for WhatsAppInboundMessageRepository, reproducing the
 * UNIQUE(wa_message_id) insert-if-new semantics of the real table.
 */
function createFakeInboundLedger({ failWith = null } = {}) {
  const seen = new Set();
  return {
    seen,
    async recordIfNew(waMessageId) {
      if (failWith) throw failWith;
      if (seen.has(waMessageId)) return false;
      seen.add(waMessageId);
      return true;
    },
  };
}

function createFakeConversationRepo() {
  const rows = new Map();
  return {
    rows,
    async find(clinicId, contactPhone) {
      return rows.get(`${clinicId}:${contactPhone}`) ?? null;
    },
    async upsertToState(clinicId, contactPhone, { currentState, context }) {
      const key = `${clinicId}:${contactPhone}`;
      const row = {
        id: rows.get(key)?.id ?? "row-1",
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

function createFakeWhatsAppClient() {
  const calls = [];
  return {
    calls,
    async sendText(phoneNumberId, to, body) {
      calls.push({ type: "text", to, body });
    },
    async sendInteractiveButtons(phoneNumberId, to, opts) {
      calls.push({ type: "buttons", to, opts });
    },
    async sendInteractiveList(phoneNumberId, to, opts) {
      calls.push({ type: "list", to, opts });
    },
  };
}

function createFakeAppointmentRepo(appointment) {
  return {
    appointment,
    async findByIdForClinic(_clinicId, id) {
      return appointment?.id === id ? appointment : null;
    },
    async findConfirmedByContact() {
      return appointment?.status === APPOINTMENT_STATUS.CONFIRMED ? [appointment] : [];
    },
    async cancelViaPatientKeyword(_clinicId, id) {
      // Conditional UPDATE: only matches while still cancellable, so a
      // replay of the same "cancel" naturally returns null.
      if (appointment?.id !== id) return null;
      if (appointment.status !== APPOINTMENT_STATUS.CONFIRMED) return null;
      appointment.status = APPOINTMENT_STATUS.CANCELLED;
      return appointment;
    },
  };
}

function confirmedAppointment() {
  return {
    id: "appt-1",
    status: APPOINTMENT_STATUS.CONFIRMED,
    slot_start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    contact_phone: CONTACT,
    patient_id: "patient-1",
  };
}

function buildService({ repo, wa, appointmentRepo = null }) {
  const noopDoctorNotifier = { async notifyHandoff() {} };
  const noopPatientSvc = { async enterState() {}, async handleReply() {} };
  const noopSlotSvc = { async handleReply() {}, async handlePaymentPendingReply() {} };
  return new ConversationStateService(
    repo, wa, noopDoctorNotifier, noopPatientSvc, noopSlotSvc, appointmentRepo,
  );
}

/** Seeds a conversation already sitting in CONFIRMED, as after a booking. */
function seedConfirmedConversation(repo) {
  repo.rows.set(`clinic-1:${CONTACT}`, {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: CONTACT,
    current_state: CONVERSATION_STATE.CONFIRMED,
    context: { last_wa_message_id: "wamid.PRIOR", appointmentId: "appt-1" },
    retry_count: 0,
    last_message_at: new Date().toISOString(),
  });
}

/** Mirrors the webhook route's per-message sequence: claim, then dispatch. */
async function deliver(ledger, service, message) {
  if (!(await claimInboundMessage(ledger, message, silentLog))) {
    return { skipped: true };
  }
  return service.processInboundMessage({ clinic: CLINIC, message });
}

// ─────────────────────────────────────────────────────────────

test("same wamid delivered twice while CONFIRMED replies once and never resets state", async () => {
  const ledger = createFakeInboundLedger();
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const service = buildService({
    repo, wa, appointmentRepo: createFakeAppointmentRepo(confirmedAppointment()),
  });
  seedConfirmedConversation(repo);

  const message = buildMessage({ waMessageId: "wamid.DUP" });
  const first = await deliver(ledger, service, message);
  const second = await deliver(ledger, service, message);

  assert.equal(first.action, "CONFIRMED_FALLBACK_SENT");
  assert.equal(second.skipped, true);

  assert.equal(wa.calls.length, 1, "redelivery must not produce a second reply");
  assert.match(wa.calls[0].body, /is confirmed/);

  const row = repo.rows.get(`clinic-1:${CONTACT}`);
  assert.equal(row.current_state, CONVERSATION_STATE.CONFIRMED);
  assert.equal(row.context.appointmentId, "appt-1");
});

test("a redelivery arriving after another message is still deduped (the single-slot gap)", async () => {
  // context.last_wa_message_id only ever holds ONE wamid: processing B
  // forgot A, so Meta's later retry of A looked brand new. This ordering is
  // exactly what produced repeat sends minutes apart with no new inbound.
  const ledger = createFakeInboundLedger();
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const service = buildService({
    repo, wa, appointmentRepo: createFakeAppointmentRepo(confirmedAppointment()),
  });
  seedConfirmedConversation(repo);

  const messageA = buildMessage({ waMessageId: "wamid.A", text: "thanks" });
  const messageB = buildMessage({ waMessageId: "wamid.B", text: "ok" });

  await deliver(ledger, service, messageA);
  await deliver(ledger, service, messageB);
  const retryOfA = await deliver(ledger, service, messageA);

  assert.equal(retryOfA.skipped, true);
  assert.equal(wa.calls.length, 2, "one reply per distinct inbound message, retries excluded");

  // The in-row second layer alone would have let this through.
  const row = repo.rows.get(`clinic-1:${CONTACT}`);
  assert.equal(row.context.last_wa_message_id, "wamid.B");
  assert.equal(row.current_state, CONVERSATION_STATE.CONFIRMED);
});

test("a redelivered reset keyword does not re-send 'let's start over'", async () => {
  const ledger = createFakeInboundLedger();
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const service = buildService({
    repo, wa, appointmentRepo: createFakeAppointmentRepo(confirmedAppointment()),
  });
  seedConfirmedConversation(repo);

  const menuMessage = buildMessage({ waMessageId: "wamid.MENU", text: "menu" });
  const first = await deliver(ledger, service, menuMessage);
  const second = await deliver(ledger, service, menuMessage);

  assert.equal(first.action, "RESET_TO_START");
  assert.equal(second.skipped, true);

  const resetSends = wa.calls.filter((c) => c.opts?.bodyText === RESET_COPY.ACKNOWLEDGED);
  assert.equal(resetSends.length, 1, "the reset acknowledgement must not repeat");
});

test("'cancel' on an already-cancelled appointment acknowledges instead of resetting to START", async () => {
  // Reached when the appointment was cancelled out from under the
  // conversation — a duplicate "cancel" whose twin already ran, or a
  // dashboard cancellation. This branch used to fall through to the reset
  // path, answering with an unprompted "No problem, let's start over".
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointment = { ...confirmedAppointment(), status: APPOINTMENT_STATUS.CANCELLED };
  const service = buildService({
    repo, wa, appointmentRepo: createFakeAppointmentRepo(appointment),
  });
  seedConfirmedConversation(repo);

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.C2", text: "cancel" }),
  });

  assert.equal(result.action, "APPOINTMENT_ALREADY_CANCELLED");
  assert.equal(result.currentState, CONVERSATION_STATE.CONFIRMED);
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].body, CONFIRMED_INBOUND_COPY.CANCELLED);
  assert.ok(
    !wa.calls.some((c) => c.opts?.bodyText === RESET_COPY.ACKNOWLEDGED),
    "a duplicate cancel must never answer with the reset copy",
  );

  const row = repo.rows.get(`clinic-1:${CONTACT}`);
  assert.equal(row.current_state, CONVERSATION_STATE.CONFIRMED, "state must survive the duplicate");
  assert.equal(row.context.last_wa_message_id, "wamid.C2");
});

test("'cancel' losing the race to a concurrent delivery acknowledges instead of resetting", async () => {
  // The appointment still reads CONFIRMED, but the conditional UPDATE
  // matches nothing because a concurrent delivery of the same "cancel"
  // committed first. Same fallback, same requirement: no state reset.
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const appointmentRepo = {
    async findByIdForClinic() {
      return confirmedAppointment();
    },
    async cancelViaPatientKeyword() {
      return null;
    },
  };
  const service = buildService({ repo, wa, appointmentRepo });
  seedConfirmedConversation(repo);

  const result = await service.processInboundMessage({
    clinic: CLINIC,
    message: buildMessage({ waMessageId: "wamid.RACE", text: "cancel" }),
  });

  assert.equal(result.action, "APPOINTMENT_ALREADY_CANCELLED");
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].body, CONFIRMED_INBOUND_COPY.CANCELLED);
  assert.equal(
    repo.rows.get(`clinic-1:${CONTACT}`).current_state,
    CONVERSATION_STATE.CONFIRMED,
  );
});

test("distinct wamids are each processed — dedupe does not mute the bot", async () => {
  const ledger = createFakeInboundLedger();
  const repo = createFakeConversationRepo();
  const wa = createFakeWhatsAppClient();
  const service = buildService({
    repo, wa, appointmentRepo: createFakeAppointmentRepo(confirmedAppointment()),
  });
  seedConfirmedConversation(repo);

  await deliver(ledger, service, buildMessage({ waMessageId: "wamid.1" }));
  await deliver(ledger, service, buildMessage({ waMessageId: "wamid.2" }));

  assert.equal(wa.calls.length, 2);
});

test("claimInboundMessage fails open when the ledger is unavailable", async () => {
  const ledger = createFakeInboundLedger({ failWith: new Error("connection refused") });

  const claimed = await claimInboundMessage(ledger, buildMessage(), silentLog);

  assert.equal(claimed, true, "a ledger outage must not silence replies to patients");
});
