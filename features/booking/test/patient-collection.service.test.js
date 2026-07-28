import test from "node:test";
import assert from "node:assert/strict";
import { PatientCollectionService } from "../services/patient-collection.service.js";
import {
  CONVERSATION_STATE,
  COLLECTING_PATIENT_STEP,
  PATIENT_SELECTION_ADD_NEW_ID,
  CONSENT_INTENT,
  DUPLICATE_MATCH_INTENT,
  START_MENU_INTENT,
} from "../constants.js";
import { patientOptionRowId } from "../lib/patient-list.js";
import { parseAgeOrDob } from "../lib/patient-input.js";

const CLINIC = { id: "clinic-1", name: "Test Clinic", whatsapp_phone_number_id: "PNID_1" };

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
    current_state: CONVERSATION_STATE.COLLECTING_PATIENT,
    context: {},
    retry_count: 0,
    last_message_at: new Date().toISOString(),
    ...overrides,
  };
}

/** In-memory fake standing in for ConversationStateRepository (update() only — this service never creates rows). */
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

/** In-memory fake standing in for PatientRepository. */
function createFakePatientRepo(initialPatients = []) {
  const patients = new Map(initialPatients.map((p) => [p.id, { ...p }]));
  let idCounter = 1;
  return {
    patients,
    async findByContact(clinicId, contactPhone) {
      return Array.from(patients.values()).filter(
        (p) => p.clinic_id === clinicId && p.contact_phone === contactPhone,
      );
    },
    async findById(clinicId, patientId) {
      const p = patients.get(patientId);
      return p && p.clinic_id === clinicId ? p : null;
    },
    async create(data) {
      const patient = {
        id: `patient-${idCounter++}`,
        relationship_to_contact: "self",
        gender: null,
        ...data,
        consent_given: true,
        consent_given_at: new Date().toISOString(),
      };
      patients.set(patient.id, patient);
      return patient;
    },
    async recordConsent(clinicId, patientId) {
      const p = patients.get(patientId);
      p.consent_given = true;
      p.consent_given_at = new Date().toISOString();
      return p;
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

/**
 * Fake standing in for SlotSelectionService — see
 * slot-selection.service.test.js for the real SLOT_SELECTION behavior;
 * these tests only check that PatientCollectionService hands off to it
 * correctly once a patient is confirmed.
 */
function createFakeSlotSelectionService() {
  const calls = [];
  return {
    calls,
    async enterState({ message, row }) {
      calls.push({ method: "enterState", contactPhone: message.contactPhone, patientId: row.context?.selectedPatientId });
      return {
        handled: true,
        action: "SLOT_SELECTION_ENTERED",
        currentState: row.current_state,
        patientId: row.context?.selectedPatientId,
      };
    },
  };
}

/** In-memory fake standing in for VaccinationSeedingService. Records every call. */
function createFakeVaccinationSeedingService({ throwError } = {}) {
  const calls = [];
  return {
    calls,
    async seedVaccinationSchedule(params) {
      calls.push(params);
      if (throwError) throw throwError;
      return { seeded: true, count: 39 };
    },
  };
}

function makeService({ patients = [], vaccinationSeedingService } = {}) {
  const repo = createFakeConversationRepo(buildRow());
  const patientRepo = createFakePatientRepo(patients);
  const wa = createFakeWhatsAppClient();
  const slotSvc = createFakeSlotSelectionService();
  const service = new PatientCollectionService(repo, patientRepo, wa, slotSvc, { vaccinationSeedingService });
  return { service, repo, patientRepo, wa, slotSvc };
}

// ─────────────────────────────────────────────────────────────
// enterState
// ─────────────────────────────────────────────────────────────

test("enterState: no existing patients — prompts directly for a name", async () => {
  const { service, repo, wa } = makeService();

  const result = await service.enterState({ clinic: CLINIC, message: buildMessage(), row: repo.row });

  assert.equal(result.action, "NAME_PROMPTED");
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].type, "text");
  assert.equal(repo.row.context.collectingPatientStep, COLLECTING_PATIENT_STEP.AWAITING_NAME);
});

test("enterState: existing patients — presents a selection list including 'Add new patient'", async () => {
  const { service, repo, wa } = makeService({
    patients: [
      { id: "p1", clinic_id: "clinic-1", contact_phone: "919876543210", full_name: "Asha Kapoor", age_years: 34, consent_given: true },
      { id: "p2", clinic_id: "clinic-1", contact_phone: "919876543210", full_name: "Little Kiran", age_years: 4, consent_given: true },
    ],
  });

  const result = await service.enterState({ clinic: CLINIC, message: buildMessage(), row: repo.row });

  assert.equal(result.action, "PATIENT_LIST_SENT");
  assert.equal(wa.calls.length, 1);
  assert.equal(wa.calls[0].type, "list");
  const rowIds = wa.calls[0].opts.rows.map((r) => r.id);
  assert.deepEqual(rowIds, [patientOptionRowId("p1"), patientOptionRowId("p2"), PATIENT_SELECTION_ADD_NEW_ID]);
  assert.equal(repo.row.context.collectingPatientStep, COLLECTING_PATIENT_STEP.AWAITING_SELECTION);
  assert.equal(repo.row.context.patientOptions.length, 2);
});

// ─────────────────────────────────────────────────────────────
// AWAITING_SELECTION
// ─────────────────────────────────────────────────────────────

test("AWAITING_SELECTION: picking an existing patient with consent on file goes straight to SLOT_SELECTION", async () => {
  const patient = { id: "p1", clinic_id: "clinic-1", contact_phone: "919876543210", full_name: "Asha Kapoor", age_years: 34, consent_given: true };
  const { service, repo, slotSvc } = makeService({ patients: [patient] });
  repo.update(repo.row.id, {
    context: { collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_SELECTION, patientOptions: [{ id: "p1", full_name: "Asha Kapoor" }] },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: patientOptionRowId("p1") }),
    row: repo.row,
  });

  assert.equal(result.action, "SLOT_SELECTION_ENTERED");
  assert.equal(result.currentState, CONVERSATION_STATE.SLOT_SELECTION);
  assert.equal(result.patientId, "p1");
  assert.equal(repo.row.current_state, CONVERSATION_STATE.SLOT_SELECTION);
  assert.equal(slotSvc.calls.length, 1);
  assert.equal(slotSvc.calls[0].method, "enterState");
});

test("AWAITING_SELECTION: picking an existing patient WITHOUT consent asks for consent first", async () => {
  const patient = { id: "p1", clinic_id: "clinic-1", contact_phone: "919876543210", full_name: "Asha Kapoor", age_years: 34, consent_given: false };
  const { service, repo, wa } = makeService({ patients: [patient] });
  await repo.update(repo.row.id, {
    context: { collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_SELECTION, patientOptions: [{ id: "p1", full_name: "Asha Kapoor" }] },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: patientOptionRowId("p1") }),
    row: repo.row,
  });

  assert.equal(result.action, "CONSENT_PROMPTED");
  assert.equal(repo.row.context.collectingPatientStep, COLLECTING_PATIENT_STEP.AWAITING_CONSENT);
  assert.equal(repo.row.context.pendingPatient.existingPatientId, "p1");
  assert.equal(wa.calls[0].type, "buttons");
  assert.match(wa.calls[0].opts.bodyText, /Asha Kapoor/);
});

test("AWAITING_SELECTION: 'Add new patient' moves to AWAITING_NAME", async () => {
  const { service, repo, wa } = makeService({
    patients: [{ id: "p1", clinic_id: "clinic-1", contact_phone: "919876543210", full_name: "Asha Kapoor", consent_given: true }],
  });
  await repo.update(repo.row.id, {
    context: { collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_SELECTION, patientOptions: [{ id: "p1", full_name: "Asha Kapoor" }] },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: PATIENT_SELECTION_ADD_NEW_ID }),
    row: repo.row,
  });

  assert.equal(result.action, "NAME_PROMPTED");
  assert.equal(repo.row.context.collectingPatientStep, COLLECTING_PATIENT_STEP.AWAITING_NAME);
  assert.equal(wa.calls[0].type, "text");
});

test("AWAITING_SELECTION: unrecognized reply re-prompts the same list", async () => {
  const { service, repo, wa } = makeService({
    patients: [{ id: "p1", clinic_id: "clinic-1", contact_phone: "919876543210", full_name: "Asha Kapoor", consent_given: true }],
  });
  await repo.update(repo.row.id, {
    context: { collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_SELECTION, patientOptions: [{ id: "p1", full_name: "Asha Kapoor" }] },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "text", text: "huh" }),
    row: repo.row,
  });

  assert.equal(result.action, "SELECTION_REPROMPTED");
  assert.equal(wa.calls[0].type, "list");
  assert.equal(repo.row.context.collectingPatientStep, COLLECTING_PATIENT_STEP.AWAITING_SELECTION);
});

// ─────────────────────────────────────────────────────────────
// AWAITING_NAME + fuzzy duplicate matching
// ─────────────────────────────────────────────────────────────

test("AWAITING_NAME: empty name is rejected and re-prompted", async () => {
  const { service, repo, wa } = makeService();
  await repo.update(repo.row.id, { context: { collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_NAME } });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "text", text: "   " }),
    row: repo.row,
  });

  assert.equal(result.action, "NAME_REPROMPTED");
  assert.equal(repo.row.context.collectingPatientStep, COLLECTING_PATIENT_STEP.AWAITING_NAME);
  assert.match(wa.calls[0].body, /can't be empty/);
});

test("AWAITING_NAME: non-text reply is rejected and re-prompted", async () => {
  const { service, repo, wa } = makeService();
  await repo.update(repo.row.id, { context: { collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_NAME } });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: "whatever" }),
    row: repo.row,
  });

  assert.equal(result.action, "NAME_REPROMPTED");
  assert.match(wa.calls[0].body, /type the patient's full name/);
});

test("AWAITING_NAME: distinct name with no close match proceeds straight to age/DOB prompt", async () => {
  const { service, repo, wa } = makeService();
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_NAME,
      patientOptions: [{ id: "p1", full_name: "Priya Patel" }],
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "text", text: "Rohan Sharma" }),
    row: repo.row,
  });

  assert.equal(result.action, "AGE_OR_DOB_PROMPTED");
  assert.equal(repo.row.context.collectingPatientStep, COLLECTING_PATIENT_STEP.AWAITING_AGE_OR_DOB);
  assert.equal(repo.row.context.pendingPatient.name, "Rohan Sharma");
  assert.match(wa.calls[0].body, /Rohan Sharma/);
});

test("AWAITING_NAME: a close-match name triggers a duplicate confirmation instead of proceeding", async () => {
  const { service, repo, wa } = makeService();
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_NAME,
      patientOptions: [{ id: "p1", full_name: "Rohan Sharma" }],
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "text", text: "Rohn Sharma" }), // one-letter typo
    row: repo.row,
  });

  assert.equal(result.action, "DUPLICATE_CONFIRMATION_PROMPTED");
  assert.equal(repo.row.context.collectingPatientStep, COLLECTING_PATIENT_STEP.AWAITING_DUPLICATE_CONFIRMATION);
  assert.equal(repo.row.context.duplicateMatchCandidateId, "p1");
  assert.equal(wa.calls[0].type, "buttons");
  assert.match(wa.calls[0].opts.bodyText, /Rohan Sharma/);
});

// ─────────────────────────────────────────────────────────────
// AWAITING_DUPLICATE_CONFIRMATION
// ─────────────────────────────────────────────────────────────

test("AWAITING_DUPLICATE_CONFIRMATION: confirming 'yes, same person' selects the existing patient", async () => {
  const patient = { id: "p1", clinic_id: "clinic-1", contact_phone: "919876543210", full_name: "Rohan Sharma", consent_given: true };
  const { service, repo, slotSvc } = makeService({ patients: [patient] });
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_DUPLICATE_CONFIRMATION,
      pendingPatient: { name: "Rohn Sharma" },
      duplicateMatchCandidateId: "p1",
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: DUPLICATE_MATCH_INTENT.YES }),
    row: repo.row,
  });

  assert.equal(result.action, "SLOT_SELECTION_ENTERED");
  assert.equal(result.patientId, "p1");
  assert.equal(slotSvc.calls.length, 1);
});

test("AWAITING_DUPLICATE_CONFIRMATION: 'no, different person' proceeds to age/DOB using the typed name", async () => {
  const patient = { id: "p1", clinic_id: "clinic-1", contact_phone: "919876543210", full_name: "Rohan Sharma", consent_given: true };
  const { service, repo, wa } = makeService({ patients: [patient] });
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_DUPLICATE_CONFIRMATION,
      pendingPatient: { name: "Rohn Sharma" },
      duplicateMatchCandidateId: "p1",
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: DUPLICATE_MATCH_INTENT.NO }),
    row: repo.row,
  });

  assert.equal(result.action, "AGE_OR_DOB_PROMPTED");
  assert.equal(repo.row.context.pendingPatient.name, "Rohn Sharma");
  assert.match(wa.calls[0].body, /Rohn Sharma/);
});

test("AWAITING_DUPLICATE_CONFIRMATION: unrecognized reply re-prompts the same two options", async () => {
  const { service, repo, wa } = makeService();
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_DUPLICATE_CONFIRMATION,
      pendingPatient: { name: "Rohn Sharma" },
      duplicateMatchCandidateId: "p1",
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "text", text: "maybe" }),
    row: repo.row,
  });

  assert.equal(result.action, "DUPLICATE_CONFIRMATION_REPROMPTED");
  assert.equal(wa.calls[0].type, "text");
});

// ─────────────────────────────────────────────────────────────
// AWAITING_AGE_OR_DOB
// ─────────────────────────────────────────────────────────────

test("AWAITING_AGE_OR_DOB: valid age proceeds to consent prompt and stashes an approximate DOB", async () => {
  const { service, repo, wa } = makeService();
  await repo.update(repo.row.id, {
    context: { collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_AGE_OR_DOB, pendingPatient: { name: "Rohan Sharma" } },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "text", text: "34" }),
    row: repo.row,
  });

  assert.equal(result.action, "CONSENT_PROMPTED");
  assert.equal(repo.row.context.collectingPatientStep, COLLECTING_PATIENT_STEP.AWAITING_CONSENT);
  assert.equal(repo.row.context.pendingPatient.ageYears, 34);
  assert.equal(repo.row.context.pendingPatient.dobIsApproximate, true);
  const expectedYear = new Date().getFullYear() - 34;
  assert.equal(repo.row.context.pendingPatient.dateOfBirth, `${expectedYear}-01-01`);
  assert.equal(wa.calls[0].type, "buttons");
  assert.match(wa.calls[0].opts.bodyText, /Rohan Sharma/);
});

test("AWAITING_AGE_OR_DOB: a real date of birth reply is stashed as-is, never approximated", async () => {
  const { service, repo } = makeService();
  await repo.update(repo.row.id, {
    context: { collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_AGE_OR_DOB, pendingPatient: { name: "Little Kiran" } },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "text", text: "15-01-2022" }),
    row: repo.row,
  });

  // Golden value comes from the parser itself (not hardcoded) so this test
  // isn't coupled to the pre-existing, out-of-scope UTC-conversion behavior
  // of the exact-DOB branch (parsed.toISOString() can shift a local
  // midnight parse by a day depending on the runner's timezone) — it only
  // asserts that whatever a real DOB parses to is never replaced by the
  // age-based approximation, and that "2022" (the year 4 years before a
  // ~2026 "now") never collides with the Jan-1 approximation format either.
  const golden = parseAgeOrDob("15-01-2022");
  assert.equal(result.action, "CONSENT_PROMPTED");
  assert.equal(repo.row.context.pendingPatient.dobIsApproximate, false);
  assert.equal(repo.row.context.pendingPatient.dateOfBirth, golden.dateOfBirth);
  assert.notEqual(repo.row.context.pendingPatient.dateOfBirth, "2022-01-01"); // not the age-4 approximation
});

test("AWAITING_AGE_OR_DOB: out-of-range age is rejected and re-prompted", async () => {
  const { service, repo, wa } = makeService();
  await repo.update(repo.row.id, {
    context: { collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_AGE_OR_DOB, pendingPatient: { name: "Rohan Sharma" } },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "text", text: "250" }),
    row: repo.row,
  });

  assert.equal(result.action, "AGE_OR_DOB_REPROMPTED");
  assert.equal(repo.row.context.collectingPatientStep, COLLECTING_PATIENT_STEP.AWAITING_AGE_OR_DOB);
  assert.match(wa.calls[0].body, /between 0 and 120/);
});

// ─────────────────────────────────────────────────────────────
// AWAITING_CONSENT (DPDP)
// ─────────────────────────────────────────────────────────────

test("AWAITING_CONSENT: consenting for a NEW patient creates the record and transitions to SLOT_SELECTION", async () => {
  const { service, repo, patientRepo, slotSvc } = makeService();
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_CONSENT,
      pendingPatient: { name: "Rohan Sharma", ageYears: 34, dateOfBirth: null },
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: CONSENT_INTENT.YES }),
    row: repo.row,
  });

  assert.equal(result.action, "SLOT_SELECTION_ENTERED");
  assert.equal(result.currentState, CONVERSATION_STATE.SLOT_SELECTION);

  const created = Array.from(patientRepo.patients.values())[0];
  assert.equal(created.full_name, "Rohan Sharma");
  assert.equal(created.age_years, 34);
  assert.equal(created.consent_given, true);
  assert.ok(created.consent_given_at);
  assert.equal(created.contact_phone, "919876543210");
  assert.equal(created.clinic_id, "clinic-1");

  assert.equal(repo.row.context.selectedPatientId, created.id);
  assert.equal(slotSvc.calls.length, 1);
  assert.equal(slotSvc.calls[0].patientId, created.id);
});

test("AWAITING_CONSENT: consenting for a NEW patient with a date of birth triggers vaccination schedule auto-seed", async () => {
  const vaccinationSeedingService = createFakeVaccinationSeedingService();
  const { service, repo, patientRepo } = makeService({ vaccinationSeedingService });
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_CONSENT,
      pendingPatient: { name: "Little Kiran", ageYears: 4, dateOfBirth: "2022-01-15" },
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: CONSENT_INTENT.YES }),
    row: repo.row,
  });

  assert.equal(result.action, "SLOT_SELECTION_ENTERED");
  const created = Array.from(patientRepo.patients.values())[0];
  assert.equal(created.date_of_birth_is_approximate, false);
  assert.equal(vaccinationSeedingService.calls.length, 1);
  assert.deepEqual(vaccinationSeedingService.calls[0], {
    patientId: created.id,
    clinicId: "clinic-1",
    dateOfBirth: "2022-01-15",
  });
});

test("AWAITING_CONSENT: consenting for a NEW patient from a plain age reply (approximate DOB) now triggers vaccination schedule auto-seed", async () => {
  const vaccinationSeedingService = createFakeVaccinationSeedingService();
  const { service, repo, patientRepo } = makeService({ vaccinationSeedingService });
  const approxDateOfBirth = `${new Date().getFullYear() - 34}-01-01`;
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_CONSENT,
      // Shape produced by _handleAgeOrDobReply for a plain "34" reply (see
      // parseAgeOrDob) — no real DOB was ever typed, only an age.
      pendingPatient: { name: "Rohan Sharma", ageYears: 34, dateOfBirth: approxDateOfBirth, dobIsApproximate: true },
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: CONSENT_INTENT.YES }),
    row: repo.row,
  });

  assert.equal(result.action, "SLOT_SELECTION_ENTERED");
  const created = Array.from(patientRepo.patients.values())[0];
  assert.equal(created.date_of_birth, approxDateOfBirth);
  assert.equal(created.date_of_birth_is_approximate, true);
  assert.equal(vaccinationSeedingService.calls.length, 1);
  assert.deepEqual(vaccinationSeedingService.calls[0], {
    patientId: created.id,
    clinicId: "clinic-1",
    dateOfBirth: approxDateOfBirth,
  });
});

test("AWAITING_CONSENT: a real DOB reply is never overwritten by the age-based approximation when both happen to be present", async () => {
  const vaccinationSeedingService = createFakeVaccinationSeedingService();
  const { service, repo, patientRepo } = makeService({ vaccinationSeedingService });
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_CONSENT,
      // A real parsed DOB (dobIsApproximate: false) must win — the
      // approximation only ever applies when no real DOB was parsed.
      pendingPatient: { name: "Little Kiran", ageYears: 4, dateOfBirth: "2022-01-15", dobIsApproximate: false },
    },
  });

  await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: CONSENT_INTENT.YES }),
    row: repo.row,
  });

  const created = Array.from(patientRepo.patients.values())[0];
  assert.equal(created.date_of_birth, "2022-01-15");
  assert.equal(created.date_of_birth_is_approximate, false);
  assert.equal(vaccinationSeedingService.calls[0].dateOfBirth, "2022-01-15");
});

test("AWAITING_CONSENT: defensive guard — no dateOfBirth at all on pendingPatient skips auto-seed, patient still created", async () => {
  const vaccinationSeedingService = createFakeVaccinationSeedingService();
  const { service, repo, patientRepo } = makeService({ vaccinationSeedingService });
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_CONSENT,
      // Hand-built context bypassing AWAITING_AGE_OR_DOB entirely (e.g. a
      // future/alternate flow) — parseAgeOrDob normally always yields some
      // dateOfBirth, so this only exercises the defensive `if` guard.
      pendingPatient: { name: "Rohan Sharma", ageYears: 34, dateOfBirth: null },
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: CONSENT_INTENT.YES }),
    row: repo.row,
  });

  assert.equal(result.action, "SLOT_SELECTION_ENTERED");
  assert.equal(patientRepo.patients.size, 1); // patient creation unaffected
  assert.equal(vaccinationSeedingService.calls.length, 0); // never called without a DOB
});

test("AWAITING_CONSENT: new patient creation succeeds even when vaccination schedule auto-seed throws (best-effort, never blocks)", async () => {
  const vaccinationSeedingService = createFakeVaccinationSeedingService({ throwError: new Error("seeding boom") });
  const { service, repo, patientRepo, slotSvc } = makeService({ vaccinationSeedingService });
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_CONSENT,
      pendingPatient: { name: "Little Kiran", ageYears: 4, dateOfBirth: "2022-01-15" },
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: CONSENT_INTENT.YES }),
    row: repo.row,
  });

  assert.equal(result.action, "SLOT_SELECTION_ENTERED");
  assert.equal(patientRepo.patients.size, 1);
  assert.equal(slotSvc.calls.length, 1);
  assert.equal(vaccinationSeedingService.calls.length, 1);
});

test("AWAITING_CONSENT: works with no vaccinationSeedingService configured at all (factory default)", async () => {
  const { service, repo, patientRepo } = makeService(); // no vaccinationSeedingService passed
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_CONSENT,
      pendingPatient: { name: "Little Kiran", ageYears: 4, dateOfBirth: "2022-01-15" },
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: CONSENT_INTENT.YES }),
    row: repo.row,
  });

  assert.equal(result.action, "SLOT_SELECTION_ENTERED");
  assert.equal(patientRepo.patients.size, 1);
});

test("AWAITING_CONSENT: consenting for an EXISTING (previously non-consented) patient never triggers auto-seed (no new patient row)", async () => {
  const patient = { id: "p1", clinic_id: "clinic-1", contact_phone: "919876543210", full_name: "Asha Kapoor", consent_given: false };
  const vaccinationSeedingService = createFakeVaccinationSeedingService();
  const { service, repo } = makeService({ patients: [patient], vaccinationSeedingService });
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_CONSENT,
      pendingPatient: { existingPatientId: "p1", full_name: "Asha Kapoor" },
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: CONSENT_INTENT.YES }),
    row: repo.row,
  });

  assert.equal(result.action, "SLOT_SELECTION_ENTERED");
  assert.equal(vaccinationSeedingService.calls.length, 0);
});

test("AWAITING_CONSENT: consenting for an EXISTING (previously non-consented) patient stamps consent, doesn't duplicate", async () => {
  const patient = { id: "p1", clinic_id: "clinic-1", contact_phone: "919876543210", full_name: "Asha Kapoor", consent_given: false };
  const { service, repo, patientRepo, slotSvc } = makeService({ patients: [patient] });
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_CONSENT,
      pendingPatient: { existingPatientId: "p1", full_name: "Asha Kapoor" },
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: CONSENT_INTENT.YES }),
    row: repo.row,
  });

  assert.equal(result.action, "SLOT_SELECTION_ENTERED");
  assert.equal(patientRepo.patients.size, 1); // no duplicate created
  assert.equal(patientRepo.patients.get("p1").consent_given, true);
  assert.equal(slotSvc.calls.length, 1);
  assert.equal(slotSvc.calls[0].patientId, "p1");
});

test("AWAITING_CONSENT: declining resets the conversation to START without creating a patient", async () => {
  const { service, repo, wa, patientRepo } = makeService();
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_CONSENT,
      pendingPatient: { name: "Rohan Sharma", ageYears: 34 },
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "button_reply", replyId: CONSENT_INTENT.NO }),
    row: repo.row,
  });

  assert.equal(result.action, "CONSENT_DECLINED");
  assert.equal(result.currentState, CONVERSATION_STATE.START);
  assert.equal(patientRepo.patients.size, 0);
  assert.equal(repo.row.context.menu_sent_at, undefined); // next message will trigger a fresh greeting resend
  assert.match(wa.calls[0].body, /can't proceed/);
});

test("AWAITING_CONSENT: unrecognized reply re-prompts without side effects", async () => {
  const { service, repo, wa, patientRepo } = makeService();
  await repo.update(repo.row.id, {
    context: {
      collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_CONSENT,
      pendingPatient: { name: "Rohan Sharma", ageYears: 34 },
    },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "text", text: "sure" }),
    row: repo.row,
  });

  assert.equal(result.action, "CONSENT_REPROMPTED");
  assert.equal(patientRepo.patients.size, 0);
  assert.equal(repo.row.current_state, CONVERSATION_STATE.COLLECTING_PATIENT);
});

// ─────────────────────────────────────────────────────────────
// Edge case: concurrent booking attempt rejected (spec: "reject with message, keep v1 simple")
// ─────────────────────────────────────────────────────────────

test("a stray 'Book' tap while already mid-flow is rejected without disturbing progress", async () => {
  const { service, repo, wa } = makeService();
  await repo.update(repo.row.id, {
    context: { collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_AGE_OR_DOB, pendingPatient: { name: "Rohan Sharma" } },
  });

  const result = await service.handleReply({
    clinic: CLINIC,
    message: buildMessage({ type: "list_reply", replyId: START_MENU_INTENT.BOOK }),
    row: repo.row,
  });

  assert.equal(result.action, "CONCURRENT_BOOKING_REJECTED");
  assert.equal(result.currentState, CONVERSATION_STATE.COLLECTING_PATIENT);
  assert.equal(repo.row.context.collectingPatientStep, COLLECTING_PATIENT_STEP.AWAITING_AGE_OR_DOB); // untouched
  assert.match(wa.calls[0].body, /already in the middle of booking/);
  assert.match(wa.calls[0].body, /Rohan Sharma/);
  assert.match(wa.calls[0].body, /restart/);
});

// ─────────────────────────────────────────────────────────────
// Defensive fallback
// ─────────────────────────────────────────────────────────────

test("an unknown/missing collectingPatientStep re-enters patient collection from scratch", async () => {
  const { service, repo, wa } = makeService({
    patients: [{ id: "p1", clinic_id: "clinic-1", contact_phone: "919876543210", full_name: "Asha Kapoor", consent_given: true }],
  });
  await repo.update(repo.row.id, { context: {} }); // no collectingPatientStep at all

  const result = await service.handleReply({ clinic: CLINIC, message: buildMessage({ type: "text", text: "hi" }), row: repo.row });

  assert.equal(result.action, "PATIENT_LIST_SENT");
  assert.equal(wa.calls[0].type, "list");
});
