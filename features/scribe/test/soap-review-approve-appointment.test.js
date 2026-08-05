import test from "node:test";
import assert from "node:assert/strict";
import { SOAPReviewService } from "../services/soap-review.service.js";
import { SESSION_STATUS, SOAP_NOTE_STATUS } from "../constants.js";
import { APPOINTMENT_STATUS } from "../../booking/constants.js";
import { mockAuditService, mockCtx, mockSessionRepository } from "./helpers/mocks.js";

function mockSoapRepository(note) {
  let current = { ...note };
  return {
    getNoteBySession: async () => ({ ...current }),
    updateNote: async (_id, patch) => {
      current = { ...current, ...patch };
      return { ...current };
    },
    insertEdit: async () => ({}),
    createVersion: async () => ({
      id: "ver-1",
      version_number: 1,
      note: current.note,
    }),
    getNextVersionNumber: async () => 1,
  };
}

function mockAppointmentRepository(appointment) {
  const calls = {
    findByIdForClinic: [],
    completeConfirmedIds: [],
  };
  let current = appointment ? { ...appointment } : null;

  return {
    calls,
    get current() {
      return current;
    },
    async findByIdForClinic(clinicId, appointmentId) {
      calls.findByIdForClinic.push({ clinicId, appointmentId });
      if (!current) return null;
      if (current.id !== appointmentId || current.clinic_id !== clinicId) return null;
      return { ...current };
    },
    async completeConfirmedIds(clinicId, appointmentIds, nowIso) {
      calls.completeConfirmedIds.push({ clinicId, appointmentIds, nowIso });
      if (
        !current
        || current.clinic_id !== clinicId
        || current.status !== APPOINTMENT_STATUS.CONFIRMED
        || !appointmentIds.includes(current.id)
      ) {
        return [];
      }
      current = { ...current, status: APPOINTMENT_STATUS.COMPLETED, updated_at: nowIso };
      return [{ id: current.id }];
    },
  };
}

function buildNote(overrides = {}) {
  return {
    id: "soap-1",
    session_id: "sess-1",
    status: SOAP_NOTE_STATUS.REVIEWING,
    note: { subjective: "s", objective: "o", assessment: "a", plan: "p" },
    original_note: { subjective: "s", objective: "o", assessment: "a", plan: "p" },
    ...overrides,
  };
}

function buildService({ session, appointment }) {
  const sessions = mockSessionRepository(session);
  const soap = mockSoapRepository(buildNote());
  const appointments = mockAppointmentRepository(appointment);
  const svc = new SOAPReviewService(sessions, soap, mockAuditService(), appointments);
  return { svc, sessions, appointments };
}

test("SOAP approve flips linked CONFIRMED appointment to COMPLETED (clinic-scoped)", async () => {
  const { svc, sessions, appointments } = buildService({
    session: {
      id: "sess-1",
      doctor_id: "doctor-1",
      clinic_id: "clinic-1",
      appointment_id: "appt-1",
      status: SESSION_STATUS.SOAP_REVIEWING,
    },
    appointment: {
      id: "appt-1",
      clinic_id: "clinic-1",
      status: APPOINTMENT_STATUS.CONFIRMED,
    },
  });

  const result = await svc.approve("sess-1", { create_version: false }, mockCtx());

  assert.equal(result.session.status, SESSION_STATUS.COMPLETED);
  assert.equal(sessions.current.status, SESSION_STATUS.COMPLETED);
  assert.deepEqual(appointments.calls.findByIdForClinic, [
    { clinicId: "clinic-1", appointmentId: "appt-1" },
  ]);
  assert.equal(appointments.calls.completeConfirmedIds.length, 1);
  assert.deepEqual(appointments.calls.completeConfirmedIds[0].appointmentIds, ["appt-1"]);
  assert.equal(appointments.calls.completeConfirmedIds[0].clinicId, "clinic-1");
  assert.equal(appointments.current.status, APPOINTMENT_STATUS.COMPLETED);
});

test("SOAP approve on non-CONFIRMED appointment does NOT change appointment status", async () => {
  const { svc, appointments } = buildService({
    session: {
      id: "sess-1",
      doctor_id: "doctor-1",
      clinic_id: "clinic-1",
      appointment_id: "appt-1",
      status: SESSION_STATUS.SOAP_REVIEWING,
    },
    appointment: {
      id: "appt-1",
      clinic_id: "clinic-1",
      status: APPOINTMENT_STATUS.CANCELLED,
    },
  });

  const result = await svc.approve("sess-1", { create_version: false }, mockCtx());

  assert.equal(result.session.status, SESSION_STATUS.COMPLETED);
  assert.equal(appointments.calls.findByIdForClinic.length, 1);
  assert.equal(appointments.calls.completeConfirmedIds.length, 0);
  assert.equal(appointments.current.status, APPOINTMENT_STATUS.CANCELLED);
});

test("SOAP approve with no linked appointment skips appointment update", async () => {
  const { svc, appointments } = buildService({
    session: {
      id: "sess-1",
      doctor_id: "doctor-1",
      clinic_id: "clinic-1",
      appointment_id: null,
      status: SESSION_STATUS.SOAP_REVIEWING,
    },
    appointment: {
      id: "appt-1",
      clinic_id: "clinic-1",
      status: APPOINTMENT_STATUS.CONFIRMED,
    },
  });

  await svc.approve("sess-1", { create_version: false }, mockCtx());

  assert.equal(appointments.calls.findByIdForClinic.length, 0);
  assert.equal(appointments.calls.completeConfirmedIds.length, 0);
  assert.equal(appointments.current.status, APPOINTMENT_STATUS.CONFIRMED);
});
