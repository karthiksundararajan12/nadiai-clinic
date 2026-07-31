import test from "node:test";
import assert from "node:assert/strict";
import { APPOINTMENT_STATUS } from "../../booking/constants.js";
import { SESSION_STATUS } from "../constants.js";
import {
  completedAppointmentIdsFromSessions,
  filterEligibleConsultationAppointments,
} from "./eligible-consultation-patients.js";

const PATIENT_A = "patient-karthik";
const PATIENT_B = "patient-asha";

const APPT_COMPLETED_SESSION = {
  id: "appt-done",
  patient_id: PATIENT_A,
  status: APPOINTMENT_STATUS.CONFIRMED,
  slot_start: "2026-07-31T04:00:00.000Z",
};

const APPT_PENDING_SESSION = {
  id: "appt-pending",
  patient_id: PATIENT_B,
  status: APPOINTMENT_STATUS.CONFIRMED,
  slot_start: "2026-07-31T05:00:00.000Z",
};

const APPT_NO_SESSION = {
  id: "appt-new",
  patient_id: PATIENT_A,
  status: APPOINTMENT_STATUS.CONFIRMED,
  slot_start: "2026-08-02T04:00:00.000Z",
};

const APPT_CANCELLED = {
  id: "appt-cancelled",
  patient_id: PATIENT_A,
  status: APPOINTMENT_STATUS.CANCELLED,
  slot_start: "2026-07-31T06:00:00.000Z",
};

test("excludes a patient whose scribe session for the current appointment is COMPLETED", () => {
  const completedIds = completedAppointmentIdsFromSessions([
    {
      appointment_id: APPT_COMPLETED_SESSION.id,
      status: SESSION_STATUS.COMPLETED,
      patient_id: PATIENT_A,
    },
  ]);

  const eligible = filterEligibleConsultationAppointments(
    [APPT_COMPLETED_SESSION],
    completedIds,
  );

  assert.deepEqual(eligible, []);
});

test("includes a patient with a pending/no scribe session for their current confirmed appointment", () => {
  const withPendingSession = filterEligibleConsultationAppointments(
    [APPT_PENDING_SESSION],
    completedAppointmentIdsFromSessions([
      {
        appointment_id: APPT_PENDING_SESSION.id,
        status: SESSION_STATUS.CREATED,
        patient_id: PATIENT_B,
      },
    ]),
  );
  assert.deepEqual(withPendingSession.map((a) => a.id), [APPT_PENDING_SESSION.id]);

  const withNoSession = filterEligibleConsultationAppointments(
    [APPT_NO_SESSION],
    completedAppointmentIdsFromSessions([]),
  );
  assert.deepEqual(withNoSession.map((a) => a.id), [APPT_NO_SESSION.id]);
});

test("includes a patient again for a new upcoming appointment even if an earlier appointment is completed", () => {
  const sessions = [
    {
      appointment_id: APPT_COMPLETED_SESSION.id,
      status: SESSION_STATUS.COMPLETED,
      patient_id: PATIENT_A,
    },
    // Unrelated completed session for another patient must not affect Karthik's new appt.
    {
      appointment_id: "appt-other-patient",
      status: SESSION_STATUS.COMPLETED,
      patient_id: PATIENT_B,
    },
  ];

  const eligible = filterEligibleConsultationAppointments(
    [APPT_COMPLETED_SESSION, APPT_NO_SESSION, APPT_CANCELLED],
    completedAppointmentIdsFromSessions(sessions),
  );

  assert.deepEqual(
    eligible.map((a) => a.id),
    [APPT_NO_SESSION.id],
    "only the new CONFIRMED appointment without a completed session is kept",
  );
  assert.equal(eligible[0].patient_id, PATIENT_A);
});

test("completedAppointmentIdsFromSessions ignores non-completed and null appointment_id rows", () => {
  const ids = completedAppointmentIdsFromSessions([
    { appointment_id: "a1", status: SESSION_STATUS.COMPLETED },
    { appointment_id: "a2", status: SESSION_STATUS.SOAP_APPROVED },
    { appointment_id: null, status: SESSION_STATUS.COMPLETED },
    { appointment_id: "a1", status: SESSION_STATUS.COMPLETED },
  ]);

  assert.deepEqual([...ids].sort(), ["a1"]);
});
