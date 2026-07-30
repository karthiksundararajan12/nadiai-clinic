import test from "node:test";
import assert from "node:assert/strict";
import { resolvePatientRegisteredDateRange } from "./lib/patient-list.js";
import { PatientRequestError, PatientsService } from "./patients.service.js";
import { APPOINTMENT_STATUS } from "../booking/constants.js";

test("resolvePatientRegisteredDateRange today returns IST day bounds on registered date", () => {
  const now = new Date("2026-07-23T08:00:00.000Z"); // 13:30 IST
  const { fromIso, toIso } = resolvePatientRegisteredDateRange("today", { now });
  assert.equal(fromIso, new Date("2026-07-23T00:00:00+05:30").toISOString());
  assert.equal(toIso, new Date("2026-07-23T23:59:59.999+05:30").toISOString());
});

test("resolvePatientRegisteredDateRange custom uses from/to YMD", () => {
  const { fromIso, toIso } = resolvePatientRegisteredDateRange("custom", {
    from: "2026-07-01",
    to: "2026-07-15",
  });
  assert.equal(fromIso, new Date("2026-07-01T00:00:00+05:30").toISOString());
  assert.equal(toIso, new Date("2026-07-15T23:59:59.999+05:30").toISOString());
});

test("resolvePatientRegisteredDateRange all returns no bounds", () => {
  const { fromIso, toIso } = resolvePatientRegisteredDateRange("all");
  assert.equal(fromIso, null);
  assert.equal(toIso, null);
});

const CLINIC_A = "clinic-a";
const CLINIC_B = "clinic-b";

const PATIENT_ROW = {
  id: "patient-1",
  full_name: "Asha Kumar",
  contact_phone: "919876543210",
  age_years: null,
  date_of_birth: "2022-01-01",
  date_of_birth_is_approximate: true,
  gender: null,
  created_at: "2026-07-22T10:00:00.000Z",
};

function createListService({ listResult, findForPatientsResult, findForPatientsError } = {}) {
  const calls = { listForClinic: [], findForPatients: [] };

  const patientRepository = {
    async listForClinic(clinicId, filters) {
      calls.listForClinic.push({ clinicId, filters });
      return listResult ?? { rows: [PATIENT_ROW], total: 1 };
    },
  };

  const appointmentRepository = {
    async findForPatients(clinicId, patientIds) {
      calls.findForPatients.push({ clinicId, patientIds });
      if (findForPatientsError) throw findForPatientsError;
      return findForPatientsResult ?? [];
    },
  };

  return { calls, service: new PatientsService(patientRepository, appointmentRepository) };
}

test("listPaginated scopes the query to the requesting clinic and passes search/range through", async () => {
  const { service, calls } = createListService();

  await service.listPaginated(CLINIC_A, {
    search: "Asha",
    range: "week",
    limit: 20,
    offset: 0,
  });

  assert.equal(calls.listForClinic.length, 1);
  assert.equal(calls.listForClinic[0].clinicId, CLINIC_A);
  assert.equal(calls.listForClinic[0].filters.search, "Asha");
  assert.ok(calls.listForClinic[0].filters.fromIso);
  assert.ok(calls.listForClinic[0].filters.toIso);
  assert.equal(calls.findForPatients[0].clinicId, CLINIC_A);
  assert.deepEqual(calls.findForPatients[0].patientIds, ["patient-1"]);
});

test("listPaginated clamps limit to 1-100 and offset to non-negative", async () => {
  const { service, calls } = createListService();

  await service.listPaginated(CLINIC_A, { limit: 500, offset: -5 });
  assert.equal(calls.listForClinic[0].filters.limit, 100);
  assert.equal(calls.listForClinic[0].filters.offset, 0);

  await service.listPaginated(CLINIC_A, { limit: 0 });
  assert.equal(calls.listForClinic[1].filters.limit, 20);
});

test("listPaginated maps patient rows and computes total visits + last appointment from past, non-cancelled appointments", async () => {
  const now = new Date("2026-07-23T12:00:00.000Z");
  const { service } = createListService({
    findForPatientsResult: [
      { patient_id: "patient-1", slot_start: "2026-06-01T09:00:00.000Z", status: APPOINTMENT_STATUS.COMPLETED },
      { patient_id: "patient-1", slot_start: "2026-07-01T09:00:00.000Z", status: APPOINTMENT_STATUS.CONFIRMED },
      { patient_id: "patient-1", slot_start: "2026-07-15T09:00:00.000Z", status: APPOINTMENT_STATUS.CANCELLED },
      // Future confirmed appointment must not count as a "visit" yet.
      { patient_id: "patient-1", slot_start: "2026-08-01T09:00:00.000Z", status: APPOINTMENT_STATUS.CONFIRMED },
    ],
  });

  const result = await service.listPaginated(CLINIC_A, {}, now);

  assert.equal(result.total, 1);
  assert.equal(result.patients.length, 1);
  const patient = result.patients[0];
  assert.equal(patient.name, "Asha Kumar");
  assert.equal(patient.phone, "+91 9876543210");
  assert.equal(patient.dateOfBirthIsApproximate, true);
  assert.equal(patient.totalVisits, 2); // completed (06-01) + confirmed-in-past (07-01) — cancelled/future excluded
  assert.equal(patient.lastAppointment, "2026-07-01T09:00:00.000Z");
  assert.ok(patient.lastAppointmentLabel);
  assert.equal(result.hasMore, false);
});

test("listPaginated reports patients even when the appointment visit-stats lookup fails (best-effort)", async () => {
  const { service } = createListService({
    findForPatientsError: new Error("boom"),
  });

  const result = await service.listPaginated(CLINIC_A, {});

  assert.equal(result.patients.length, 1);
  assert.equal(result.patients[0].totalVisits, 0);
  assert.equal(result.patients[0].lastAppointment, null);
});

test("listPaginated skips the visit-stats lookup entirely when the page has no rows", async () => {
  const { service, calls } = createListService({ listResult: { rows: [], total: 0 } });

  const result = await service.listPaginated(CLINIC_A, {});

  assert.equal(result.patients.length, 0);
  assert.equal(calls.findForPatients.length, 0);
});

test("listPaginated reports hasMore based on offset + page length vs total", async () => {
  const { service } = createListService({ listResult: { rows: [PATIENT_ROW], total: 45 } });

  const result = await service.listPaginated(CLINIC_A, { limit: 20, offset: 0 });

  assert.equal(result.total, 45);
  assert.equal(result.hasMore, true);
});

function createDetailService({ patient, findForPatientResult } = {}) {
  const calls = { findById: [], findForPatient: [] };

  const patientRepository = {
    async findById(clinicId, patientId) {
      calls.findById.push({ clinicId, patientId });
      if (!patient) return null;
      // Tenancy: only resolve when the clinic matches (never a bare id lookup).
      if (clinicId !== CLINIC_A) return null;
      if (patientId !== patient.id) return null;
      return patient;
    },
  };

  const appointmentRepository = {
    async findForPatient(clinicId, patientId) {
      calls.findForPatient.push({ clinicId, patientId });
      return findForPatientResult ?? [];
    },
  };

  return { calls, service: new PatientsService(patientRepository, appointmentRepository) };
}

test("getDetail 404s when the patient doesn't exist in the requesting clinic", async () => {
  const { service } = createDetailService({ patient: PATIENT_ROW });

  await assert.rejects(
    () => service.getDetail(CLINIC_B, "patient-1"),
    (error) => error instanceof PatientRequestError && error.statusCode === 404,
  );
});

test("getDetail returns the patient plus formatted, clinic-scoped appointment history", async () => {
  const patient = {
    id: "patient-1",
    full_name: "Asha Kumar",
    contact_phone: "919876543210",
    age_years: 4,
    gender: "Female",
    date_of_birth: "2022-01-01",
    date_of_birth_is_approximate: false,
    created_at: "2026-01-01T10:00:00.000Z",
  };

  const { service, calls } = createDetailService({
    patient,
    findForPatientResult: [
      {
        id: "appt-1",
        patient_id: "patient-1",
        slot_start: "2026-07-01T09:00:00.000Z",
        slot_end: "2026-07-01T09:30:00.000Z",
        status: APPOINTMENT_STATUS.COMPLETED,
        payment_status: "paid",
        payment_amount: 500,
        created_at: "2026-06-25T10:00:00.000Z",
      },
    ],
  });

  const result = await service.getDetail(CLINIC_A, "patient-1");

  assert.equal(calls.findById[0].clinicId, CLINIC_A);
  assert.equal(calls.findForPatient[0].clinicId, CLINIC_A);
  assert.equal(calls.findForPatient[0].patientId, "patient-1");

  assert.equal(result.patient.name, "Asha Kumar");
  assert.equal(result.patient.phone, "+91 9876543210");
  assert.equal(result.patient.totalVisits, 1);
  assert.ok(result.patient.lastAppointmentLabel);
  assert.equal(result.appointmentHistory.length, 1);
  assert.equal(result.appointmentHistory[0].statusLabel, "Completed");
  assert.equal(result.appointmentHistory[0].paymentStatusLabel, "Captured");
  assert.equal(result.appointmentHistory[0].amount, 500);
  assert.ok(result.appointmentHistory[0].slotLabel);
});
