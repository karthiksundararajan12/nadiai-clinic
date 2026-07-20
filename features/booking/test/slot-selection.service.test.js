import test from "node:test";
import assert from "node:assert/strict";
import { SlotSelectionService } from "../services/slot-selection.service.js";
import {
  CONVERSATION_STATE,
  SLOT_SELECTION_STEP,
  OVERLAP_CONFIRM_INTENT,
  START_MENU_INTENT,
  HANDOFF_REASON,
  SLOT_SEARCH_DAYS_AHEAD,
  SLOT_MIN_LEAD_MINUTES,
  SLOT_DEFAULT_CONSULTATION_DURATION_MINUTES,
  SLOT_LIST_MAX_OPTIONS,
  SLOT_LIST_MORE_ROW_ID,
  SLOT_HOLD_DURATION_MINUTES,
  WHATSAPP_CONFIG,
} from "../constants.js";
import { normalizeWorkingHours, generateCandidateSlots, slotRowId } from "../lib/slot-engine.js";

const CLINIC = { id: "clinic-1", name: "Test Clinic", whatsapp_phone_number_id: "PNID_1" };

const DOCTOR_FREE = {
  id: "doc-1",
  full_name: "Dr. Test",
  working_hours_start: "09:00",
  working_hours_end: "18:00",
  consultation_duration: 30,
  consultation_fee: 0,
};

const DOCTOR_PAID = { ...DOCTOR_FREE, consultation_fee: 750 };

/** consultation_fee left unset entirely — must fail loudly, not default to a placeholder. */
const DOCTOR_NO_FEE_CONFIGURED = { ...DOCTOR_FREE, consultation_fee: null };

// Fixed slots matching the values already exercised in slot-engine.test.js
// (09:00 IST and 09:30 IST on a Monday) — used wherever a test manually
// seeds `context.offeredSlots` instead of going through enterState().
const SLOT_A = { slotStart: "2026-07-06T03:30:00.000Z", slotEnd: "2026-07-06T04:00:00.000Z" };
const SLOT_B = { slotStart: "2026-07-06T04:00:00.000Z", slotEnd: "2026-07-06T04:30:00.000Z" };

/** Every candidate slot ISO the real slot-engine would generate for this doctor right now — used to simulate "fully booked". */
function allCandidateIsosForDoctor(doctor) {
  const wh = normalizeWorkingHours(doctor.working_hours_start, doctor.working_hours_end);
  const candidates = generateCandidateSlots({
    workingHoursStart: wh.start,
    workingHoursEnd: wh.end,
    consultationDurationMinutes: doctor.consultation_duration || SLOT_DEFAULT_CONSULTATION_DURATION_MINUTES,
    daysAhead: SLOT_SEARCH_DAYS_AHEAD,
    minLeadMinutes: SLOT_MIN_LEAD_MINUTES,
  });
  return candidates.map((c) => c.slotStart.toISOString());
}

function buildMessage(overrides = {}) {
  return {
    phoneNumberId: "PNID_1",
    waMessageId: "wamid.1",
    contactPhone: "919876543210",
    contactName: "Asha",
    type: "text",
    text: null,
    replyId: null,
    replyTitle: null,
    timestamp: "1710000000",
    ...overrides,
  };
}

function buildRow(overrides = {}) {
  return {
    id: "row-1",
    clinic_id: "clinic-1",
    contact_phone: "919876543210",
    current_state: CONVERSATION_STATE.SLOT_SELECTION,
    context: {},
    retry_count: 0,
    last_message_at: new Date().toISOString(),
    ...overrides,
  };
}

function createFakeConversationRepo(initialRow) {
  let row = { ...initialRow };
  return {
    get row() {
      return row;
    },
    async update(id, updates) {
      assert.equal(id, row.id, "unexpected row id passed to update()");
      row = { ...row, ...updates };
      return row;
    },
  };
}

function createFakeAppointmentRepo({ takenIsos = [], overlaps = [], createIfAvailableImpl = null } = {}) {
  const createCalls = [];
  let idCounter = 1;
  return {
    createCalls,
    async findTakenSlotStarts() {
      return takenIsos;
    },
    async findOverlappingConfirmedForPatient() {
      return overlaps;
    },
    async createIfAvailable(data) {
      createCalls.push(data);
      if (createIfAvailableImpl) return createIfAvailableImpl(data, createCalls.length);
      return { row: { id: `appt-${idCounter++}`, ...data }, conflict: null };
    },
  };
}

function createFakeDoctorProfileRepo(doctor) {
  return { async findPrimaryByClinicId() { return doctor; } };
}

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

function createFakeDoctorNotificationService() {
  const calls = [];
  return {
    calls,
    async notifyHandoff({ reason }) {
      calls.push({ reason });
    },
  };
}

function createFakeRazorpayClient() {
  const calls = [];
  let idCounter = 1;
  return {
    calls,
    async createPaymentLink(opts) {
      calls.push(opts);
      const id = `plink_${idCounter++}`;
      return { id, shortUrl: `https://rzp.io/i/${id}` };
    },
  };
}

function makeService({ doctor = DOCTOR_FREE, takenIsos = [], overlaps = [], createIfAvailableImpl = null, row } = {}) {
  const repo = createFakeConversationRepo(row ?? buildRow());
  const appointmentRepo = createFakeAppointmentRepo({ takenIsos, overlaps, createIfAvailableImpl });
  const doctorRepo = createFakeDoctorProfileRepo(doctor);
  const wa = createFakeWhatsAppClient();
  const notifier = createFakeDoctorNotificationService();
  const razorpay = createFakeRazorpayClient();
  const service = new SlotSelectionService(repo, appointmentRepo, doctorRepo, wa, notifier, razorpay);
  return { service, repo, appointmentRepo, doctorRepo, wa, notifier, razorpay };
}

// ─────────────────────────────────────────────────────────────
// enterState
// ─────────────────────────────────────────────────────────────

test("enterState: no doctor configured for the clinic triggers HUMAN_HANDOFF and notifies staff", async () => {
  const { service, repo, wa, notifier } = makeService({ doctor: null });

  const result = await service.enterState({ clinic: CLINIC, message: buildMessage(), row: repo.row });

  assert.equal(result.action, "HUMAN_HANDOFF");
  assert.equal(result.currentState, CONVERSATION_STATE.HUMAN_HANDOFF);
  assert.equal(repo.row.context.handoff_reason, HANDOFF_REASON.NO_DOCTOR_CONFIGURED);
  assert.equal(wa.calls.length, 1);
  assert.match(wa.calls[0].body, /trouble finding an available slot/);
  assert.equal(notifier.calls.length, 1);
  assert.equal(notifier.calls[0].reason, HANDOFF_REASON.NO_DOCTOR_CONFIGURED);
});

test("enterState: doctor configured but fully booked in the search window triggers HUMAN_HANDOFF (no slots)", async () => {
  const { service, repo, wa, notifier } = makeService({
    doctor: DOCTOR_FREE,
    takenIsos: allCandidateIsosForDoctor(DOCTOR_FREE),
  });

  const result = await service.enterState({ clinic: CLINIC, message: buildMessage(), row: repo.row });

  assert.equal(result.action, "HUMAN_HANDOFF");
  assert.equal(repo.row.context.handoff_reason, HANDOFF_REASON.NO_SLOTS_AVAILABLE);
  assert.match(wa.calls[0].body, /don't have any open slots/);
  assert.equal(notifier.calls[0].reason, HANDOFF_REASON.NO_SLOTS_AVAILABLE);
});

test("enterState: presents an interactive list of open slots and stores them for the next reply", async () => {
  const { service, repo, wa } = makeService({ doctor: DOCTOR_FREE, takenIsos: [] });

  const result = await service.enterState({ clinic: CLINIC, message: buildMessage(), row: repo.row });

  assert.equal(result.action, "SLOTS_PRESENTED");
  assert.equal(result.currentState, CONVERSATION_STATE.SLOT_SELECTION);
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].type, "list");
  assert.ok(wa.calls[0].opts.rows.length > 0);
  assert.ok(wa.calls[0].opts.rows.length <= WHATSAPP_CONFIG.MAX_LIST_ROWS);
  assert.equal(repo.row.context.slotSelectionStep, SLOT_SELECTION_STEP.AWAITING_SELECTION);
  assert.equal(repo.row.context.doctorId, DOCTOR_FREE.id);
  const slotRows = wa.calls[0].opts.rows.filter((r) => r.id !== SLOT_LIST_MORE_ROW_ID);
  assert.equal(repo.row.context.offeredSlots.length, slotRows.length);
});

test("enterState: pages slots with More times when more than 10 open slots exist", async () => {
  // 20-min slots over a full day produce far more than Meta's 10-row list cap.
  const doctor = {
    ...DOCTOR_FREE,
    consultation_duration: 20,
    working_hours_start: "09:00",
    working_hours_end: "18:00",
  };
  const { service, repo, wa } = makeService({ doctor, takenIsos: [] });

  const result = await service.enterState({ clinic: CLINIC, message: buildMessage(), row: repo.row });

  assert.equal(result.action, "SLOTS_PRESENTED");
  assert.equal(wa.calls[0].opts.rows.length, SLOT_LIST_MAX_OPTIONS + 1);
  assert.equal(wa.calls[0].opts.rows.at(-1).id, SLOT_LIST_MORE_ROW_ID);
  assert.equal(repo.row.context.offeredSlots.length, SLOT_LIST_MAX_OPTIONS);
  assert.equal(repo.row.context.slotListHasMore, true);
  assert.equal(repo.row.context.slotListNextOffset, SLOT_LIST_MAX_OPTIONS);
});

test("AWAITING_SELECTION: More times advances to the next page of slots", async () => {
  const doctor = {
    ...DOCTOR_FREE,
    consultation_duration: 20,
    working_hours_start: "09:00",
    working_hours_end: "18:00",
  };
  const { service, repo, wa } = makeService({ doctor, takenIsos: [] });

  await service.enterState({ clinic: CLINIC, message: buildMessage(), row: repo.row });
  const firstPageSlots = [...repo.row.context.offeredSlots];
  const nextOffset = repo.row.context.slotListNextOffset;

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({
      type: "list_reply",
      replyId: SLOT_LIST_MORE_ROW_ID,
      replyTitle: "More times →",
      waMessageId: "wamid.more-1",
    }),
    row: repo.row,
  });

  assert.equal(result.action, "SLOTS_PRESENTED");
  assert.equal(wa.calls.length, 2);
  assert.ok(repo.row.context.offeredSlots.length > 0);
  assert.notDeepEqual(repo.row.context.offeredSlots, firstPageSlots);
  assert.ok(repo.row.context.slotListNextOffset > nextOffset
    || repo.row.context.slotListHasMore === false);
  // Second page must not repeat the first page's first slot.
  assert.notEqual(
    repo.row.context.offeredSlots[0].slotStart,
    firstPageSlots[0].slotStart,
  );
});

// ─────────────────────────────────────────────────────────────
// AWAITING_SELECTION
// ─────────────────────────────────────────────────────────────

function rowAwaitingSelection(overrides = {}) {
  return buildRow({
    context: {
      slotSelectionStep: SLOT_SELECTION_STEP.AWAITING_SELECTION,
      offeredSlots: [SLOT_A, SLOT_B],
      selectedPatientId: "p1",
      selectedPatientName: "Asha Kapoor",
      ...overrides,
    },
  });
}

test("AWAITING_SELECTION: unrecognized reply re-prompts the same list unchanged", async () => {
  const row = rowAwaitingSelection();
  const { service, repo, wa } = makeService({ row });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "text", text: "huh" }),
    row: repo.row,
  });

  assert.equal(result.action, "SELECTION_REPROMPTED");
  assert.equal(wa.calls[0].type, "list");
  assert.equal(wa.calls[0].opts.rows.length, 2);
  assert.equal(repo.row.context.slotSelectionStep, SLOT_SELECTION_STEP.AWAITING_SELECTION);
  assert.deepEqual(repo.row.context.offeredSlots, [SLOT_A, SLOT_B]);
});

test("AWAITING_SELECTION: doctor disappearing between offer and choice falls back to HUMAN_HANDOFF", async () => {
  const row = rowAwaitingSelection();
  const { service, repo } = makeService({ row, doctor: null });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: slotRowId(new Date(SLOT_A.slotStart)) }),
    row: repo.row,
  });

  assert.equal(result.action, "HUMAN_HANDOFF");
  assert.equal(repo.row.context.handoff_reason, HANDOFF_REASON.NO_DOCTOR_CONFIGURED);
});

test("AWAITING_SELECTION: no selectedPatientId in context hands off instead of crashing", async () => {
  const row = rowAwaitingSelection({ selectedPatientId: undefined });
  const { service, repo, appointmentRepo } = makeService({ row });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: slotRowId(new Date(SLOT_A.slotStart)) }),
    row: repo.row,
  });

  assert.equal(result.action, "HUMAN_HANDOFF");
  assert.equal(repo.row.context.handoff_reason, HANDOFF_REASON.MISSING_BOOKING_CONTEXT);
  assert.equal(appointmentRepo.createCalls.length, 0);
});

test("AWAITING_SELECTION: choosing a free slot with no doctor fee books directly to CONFIRMED", async () => {
  const row = rowAwaitingSelection();
  const { service, repo, wa, appointmentRepo } = makeService({ row, doctor: DOCTOR_FREE });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: slotRowId(new Date(SLOT_A.slotStart)) }),
    row: repo.row,
  });

  assert.equal(result.action, "TRANSITIONED_TO_CONFIRMED");
  assert.equal(result.currentState, CONVERSATION_STATE.CONFIRMED);
  assert.ok(result.appointmentId);
  assert.equal(repo.row.current_state, CONVERSATION_STATE.CONFIRMED);
  assert.equal(repo.row.context.appointmentId, result.appointmentId);
  assert.equal(appointmentRepo.createCalls.length, 1);
  assert.equal(appointmentRepo.createCalls[0].status, "confirmed");
  assert.equal(appointmentRepo.createCalls[0].payment_status, "not_required");
  assert.equal(appointmentRepo.createCalls[0].payment_amount, null);
  assert.equal(wa.calls[0].type, "text");
  assert.match(wa.calls[0].body, /confirmed/i);
  assert.match(wa.calls[0].body, /Asha Kapoor/);
});

test("AWAITING_SELECTION: choosing a free slot with a doctor fee transitions to PAYMENT_PENDING with a real Razorpay link for the doctor's real fee", async () => {
  const row = rowAwaitingSelection();
  const before = Date.now();
  const { service, repo, wa, appointmentRepo, razorpay } = makeService({ row, doctor: DOCTOR_PAID });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: slotRowId(new Date(SLOT_A.slotStart)) }),
    row: repo.row,
  });

  assert.equal(result.action, "TRANSITIONED_TO_PAYMENT_PENDING");
  assert.equal(result.currentState, CONVERSATION_STATE.PAYMENT_PENDING);
  assert.equal(repo.row.current_state, CONVERSATION_STATE.PAYMENT_PENDING);
  assert.equal(appointmentRepo.createCalls[0].status, "payment_pending");
  assert.equal(appointmentRepo.createCalls[0].payment_status, "pending");
  // Real per-doctor fee lookup — not a hardcoded placeholder.
  assert.equal(appointmentRepo.createCalls[0].payment_amount, DOCTOR_PAID.consultation_fee);

  assert.equal(razorpay.calls.length, 1);
  assert.equal(razorpay.calls[0].amountRupees, DOCTOR_PAID.consultation_fee);
  assert.equal(razorpay.calls[0].referenceId, result.appointmentId);
  assert.deepEqual(razorpay.calls[0].notes, { appointment_id: result.appointmentId, clinic_id: CLINIC.id });

  assert.match(wa.calls[0].body, new RegExp(`₹${DOCTOR_PAID.consultation_fee}`));
  assert.match(wa.calls[0].body, /rzp\.io\/i\/plink_1/);
  assert.match(wa.calls[0].body, new RegExp(`${SLOT_HOLD_DURATION_MINUTES} minutes`));

  const holdExpiresAt = new Date(appointmentRepo.createCalls[0].hold_expires_at).getTime();
  const expectedMinMs = before + SLOT_HOLD_DURATION_MINUTES * 60 * 1000;
  const expectedMaxMs = Date.now() + SLOT_HOLD_DURATION_MINUTES * 60 * 1000;
  assert.ok(holdExpiresAt >= expectedMinMs && holdExpiresAt <= expectedMaxMs, "hold_expires_at should be ~SLOT_HOLD_DURATION_MINUTES from now");
});

test("AWAITING_SELECTION: a doctor with no consultation_fee configured hands off instead of silently defaulting an amount", async () => {
  const row = rowAwaitingSelection();
  const { service, repo, wa, appointmentRepo, razorpay, notifier } = makeService({ row, doctor: DOCTOR_NO_FEE_CONFIGURED });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: slotRowId(new Date(SLOT_A.slotStart)) }),
    row: repo.row,
  });

  assert.equal(result.action, "HUMAN_HANDOFF");
  assert.equal(repo.row.context.handoff_reason, HANDOFF_REASON.MISSING_CONSULTATION_FEE);
  assert.equal(appointmentRepo.createCalls.length, 0, "must not create an appointment without a real amount to charge");
  assert.equal(razorpay.calls.length, 0);
  assert.equal(wa.calls.length, 1);
  assert.equal(notifier.calls[0].reason, HANDOFF_REASON.MISSING_CONSULTATION_FEE);
});

test("AWAITING_SELECTION: choosing a free slot with no doctor fee books directly to CONFIRMED with no hold set", async () => {
  const row = rowAwaitingSelection();
  const { service, repo, appointmentRepo } = makeService({ row, doctor: DOCTOR_FREE });

  await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: slotRowId(new Date(SLOT_A.slotStart)) }),
    row: repo.row,
  });

  assert.equal(appointmentRepo.createCalls[0].hold_expires_at, null);
});

test("AWAITING_SELECTION: losing the double-booking race re-fetches and re-shows a fresh list, never fails silently", async () => {
  const row = rowAwaitingSelection();
  const { service, repo, wa, appointmentRepo } = makeService({
    row,
    doctor: DOCTOR_FREE,
    takenIsos: [],
    createIfAvailableImpl: () => ({ row: null, conflict: "SLOT_TAKEN" }),
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: slotRowId(new Date(SLOT_A.slotStart)) }),
    row: repo.row,
  });

  assert.equal(appointmentRepo.createCalls.length, 1);
  assert.equal(result.action, "SLOTS_PRESENTED");
  assert.equal(result.currentState, CONVERSATION_STATE.SLOT_SELECTION);
  // Explains what happened (text) then re-shows a fresh list (list) — never silent.
  assert.equal(wa.calls.length, 2);
  assert.equal(wa.calls[0].type, "text");
  assert.match(wa.calls[0].body, /just taken/);
  assert.equal(wa.calls[1].type, "list");
  assert.equal(repo.row.context.slotSelectionStep, SLOT_SELECTION_STEP.AWAITING_SELECTION);
});

test("AWAITING_SELECTION: a wa_message_id conflict (webhook redelivery) is skipped, not double-booked", async () => {
  const row = rowAwaitingSelection();
  const { service, repo, wa, appointmentRepo } = makeService({
    row,
    doctor: DOCTOR_FREE,
    createIfAvailableImpl: () => ({ row: null, conflict: "DUPLICATE_MESSAGE" }),
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: slotRowId(new Date(SLOT_A.slotStart)) }),
    row: repo.row,
  });

  assert.equal(appointmentRepo.createCalls.length, 1);
  assert.equal(result.action, "DUPLICATE_SKIPPED");
  assert.equal(result.currentState, CONVERSATION_STATE.SLOT_SELECTION);
  assert.equal(repo.row.current_state, CONVERSATION_STATE.SLOT_SELECTION);
  assert.equal(wa.calls.length, 0);
});

test("AWAITING_SELECTION: an overlapping CONFIRMED appointment prompts for explicit confirmation instead of booking", async () => {
  const row = rowAwaitingSelection();
  const overlap = { id: "appt-existing", slot_start: SLOT_A.slotStart, slot_end: SLOT_A.slotEnd };
  const { service, repo, wa, appointmentRepo } = makeService({ row, doctor: DOCTOR_FREE, overlaps: [overlap] });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: slotRowId(new Date(SLOT_B.slotStart)) }),
    row: repo.row,
  });

  assert.equal(result.action, "OVERLAP_CONFIRMATION_PROMPTED");
  assert.equal(result.currentState, CONVERSATION_STATE.SLOT_SELECTION);
  assert.equal(appointmentRepo.createCalls.length, 0);
  assert.equal(wa.calls[0].type, "buttons");
  assert.match(wa.calls[0].opts.bodyText, /Asha Kapoor/);
  assert.equal(repo.row.context.slotSelectionStep, SLOT_SELECTION_STEP.AWAITING_OVERLAP_CONFIRMATION);
  assert.deepEqual(repo.row.context.pendingSlot, SLOT_B);
});

// ─────────────────────────────────────────────────────────────
// AWAITING_OVERLAP_CONFIRMATION
// ─────────────────────────────────────────────────────────────

function rowAwaitingOverlapConfirmation(overrides = {}) {
  return buildRow({
    context: {
      slotSelectionStep: SLOT_SELECTION_STEP.AWAITING_OVERLAP_CONFIRMATION,
      offeredSlots: [SLOT_A, SLOT_B],
      pendingSlot: SLOT_A,
      selectedPatientId: "p1",
      selectedPatientName: "Asha Kapoor",
      ...overrides,
    },
  });
}

test("AWAITING_OVERLAP_CONFIRMATION: 'yes, book anyway' books the previously-chosen slot", async () => {
  const row = rowAwaitingOverlapConfirmation();
  const { service, repo, appointmentRepo } = makeService({ row, doctor: DOCTOR_FREE });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: OVERLAP_CONFIRM_INTENT.YES }),
    row: repo.row,
  });

  assert.equal(result.action, "TRANSITIONED_TO_CONFIRMED");
  assert.equal(appointmentRepo.createCalls.length, 1);
  assert.equal(appointmentRepo.createCalls[0].slot_start, SLOT_A.slotStart);
});

test("AWAITING_OVERLAP_CONFIRMATION: 'no, let me pick again' re-presents a fresh slot list", async () => {
  const row = rowAwaitingOverlapConfirmation();
  const { service, repo, wa, appointmentRepo } = makeService({ row, doctor: DOCTOR_FREE });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: OVERLAP_CONFIRM_INTENT.NO }),
    row: repo.row,
  });

  assert.equal(result.action, "SLOTS_PRESENTED");
  assert.equal(appointmentRepo.createCalls.length, 0);
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].type, "list");
  assert.equal(repo.row.context.slotSelectionStep, SLOT_SELECTION_STEP.AWAITING_SELECTION);
  assert.equal(repo.row.context.pendingSlot, null);
});

test("AWAITING_OVERLAP_CONFIRMATION: unrecognized reply re-prompts without booking or re-listing", async () => {
  const row = rowAwaitingOverlapConfirmation();
  const { service, repo, wa, appointmentRepo } = makeService({ row, doctor: DOCTOR_FREE });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "text", text: "maybe later" }),
    row: repo.row,
  });

  assert.equal(result.action, "OVERLAP_CONFIRMATION_REPROMPTED");
  assert.equal(appointmentRepo.createCalls.length, 0);
  assert.equal(wa.calls[0].type, "text");
  assert.equal(repo.row.context.slotSelectionStep, SLOT_SELECTION_STEP.AWAITING_OVERLAP_CONFIRMATION);
});

// ─────────────────────────────────────────────────────────────
// Edge case: concurrent booking attempt rejected
// ─────────────────────────────────────────────────────────────

test("a stray 'Book' tap while already mid-flow is rejected without disturbing progress", async () => {
  const row = rowAwaitingSelection();
  const { service, repo, wa } = makeService({ row });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: START_MENU_INTENT.BOOK }),
    row: repo.row,
  });

  assert.equal(result.action, "CONCURRENT_BOOKING_REJECTED");
  assert.equal(result.currentState, CONVERSATION_STATE.SLOT_SELECTION);
  assert.equal(repo.row.context.slotSelectionStep, SLOT_SELECTION_STEP.AWAITING_SELECTION);
  assert.match(wa.calls[0].body, /already in the middle of booking/);
  assert.match(wa.calls[0].body, /Asha Kapoor/);
});

// ─────────────────────────────────────────────────────────────
// Defensive fallback
// ─────────────────────────────────────────────────────────────

test("an unknown/missing slotSelectionStep re-enters slot selection from scratch", async () => {
  const row = buildRow({ context: { selectedPatientId: "p1", selectedPatientName: "Asha Kapoor" } });
  const { service, repo, wa } = makeService({ row, doctor: DOCTOR_FREE, takenIsos: [] });

  const result = await service.handleReply({ clinic: CLINIC, message: buildMessage({ type: "text", text: "hi" }), row: repo.row });

  assert.equal(result.action, "SLOTS_PRESENTED");
  assert.equal(wa.calls[0].type, "list");
});
