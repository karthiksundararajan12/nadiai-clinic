import test from "node:test";
import assert from "node:assert/strict";
import { PatientDeleteService } from "./patient-delete.service.js";
import { PatientRequestError } from "./patients.service.js";

const CLINIC = "clinic-1";
const OTHER_CLINIC = "clinic-2";
const PATIENT = {
  id: "patient-1",
  full_name: "Karthik Sundar",
  clinic_id: CLINIC,
};

function createDeps({
  patient = PATIENT,
  appointments = [],
  invoices = [],
  scribeCount = 0,
  vaccinationCount = 0,
  vitalsCount = 0,
  hardDeletePatientResult = { id: PATIENT.id },
} = {}) {
  const calls = {
    findById: [],
    findForPatient: [],
    listByAppointmentIds: [],
    deleteInvoicePdfs: [],
    deleteByAppointmentIds: [],
    hardDeleteByPatientIdSessions: [],
    hardDeleteByPatientIdAppointments: [],
    hardDeletePatient: [],
  };

  return {
    calls,
    service: new PatientDeleteService({
      patientRepository: {
        async findById(clinicId, patientId) {
          calls.findById.push({ clinicId, patientId });
          if (clinicId !== CLINIC || patientId !== patient?.id) return null;
          return patient;
        },
        async hardDelete(clinicId, patientId) {
          calls.hardDeletePatient.push({ clinicId, patientId });
          if (clinicId !== CLINIC || patientId !== patient?.id) return null;
          return hardDeletePatientResult;
        },
      },
      appointmentRepository: {
        async findForPatient(clinicId, patientId) {
          calls.findForPatient.push({ clinicId, patientId });
          return clinicId === CLINIC ? appointments : [];
        },
        async hardDeleteByPatientId(clinicId, patientId) {
          calls.hardDeleteByPatientIdAppointments.push({ clinicId, patientId });
          return appointments.length;
        },
      },
      invoiceRepository: {
        async listByAppointmentIds(clinicId, appointmentIds) {
          calls.listByAppointmentIds.push({ clinicId, appointmentIds });
          return clinicId === CLINIC ? invoices : [];
        },
        async deleteByAppointmentIds(clinicId, appointmentIds) {
          calls.deleteByAppointmentIds.push({ clinicId, appointmentIds });
          return invoices.length;
        },
      },
      invoiceStorageService: {
        async deleteInvoicePdfs(paths) {
          calls.deleteInvoicePdfs.push(paths);
        },
      },
      scribeSessionRepository: {
        async countByPatientId(clinicId, patientId) {
          return clinicId === CLINIC ? scribeCount : 0;
        },
        async hardDeleteByPatientId(clinicId, patientId) {
          calls.hardDeleteByPatientIdSessions.push({ clinicId, patientId });
          return scribeCount;
        },
      },
      vaccinationRepository: {
        async countForPatient(clinicId) {
          return clinicId === CLINIC ? vaccinationCount : 0;
        },
      },
      vitalsRepository: {
        async countForPatient(clinicId) {
          return clinicId === CLINIC ? vitalsCount : 0;
        },
      },
    }),
  };
}

test("getDeletionImpact: returns counts for clinic-scoped patient", async () => {
  const { service } = createDeps({
    appointments: [
      { id: "appt-1", payment_status: "not_required" },
      { id: "appt-2", payment_status: "refunded" },
    ],
    invoices: [{ id: "inv-1", storage_path: "invoices/clinic-1/appt-1.pdf" }],
    scribeCount: 3,
    vaccinationCount: 39,
    vitalsCount: 2,
  });

  const impact = await service.getDeletionImpact(CLINIC, PATIENT.id);

  assert.equal(impact.appointments, 2);
  assert.equal(impact.bookingInvoices, 1);
  assert.equal(impact.scribeSessions, 3);
  assert.equal(impact.vaccinationSchedules, 39);
  assert.equal(impact.vitals, 2);
  assert.equal(impact.blocked, false);
});

test("getDeletionImpact: clinic scoping — other clinic's patient is 404", async () => {
  const { service, calls } = createDeps();
  await assert.rejects(
    () => service.getDeletionImpact(OTHER_CLINIC, PATIENT.id),
    (err) => err instanceof PatientRequestError && err.statusCode === 404,
  );
  assert.equal(calls.findById[0].clinicId, OTHER_CLINIC);
});

test("hardDelete: cascades invoices → scribe → appointments → patient", async () => {
  const appointments = [
    { id: "appt-1", payment_status: "not_required" },
    { id: "appt-2", payment_status: "failed" },
  ];
  const invoices = [
    { id: "inv-1", storage_path: "invoices/clinic-1/appt-1.pdf" },
  ];
  const { service, calls } = createDeps({
    appointments,
    invoices,
    scribeCount: 1,
    vaccinationCount: 5,
    vitalsCount: 1,
  });

  const result = await service.hardDelete(CLINIC, PATIENT.id);

  assert.equal(result.deleted, true);
  assert.deepEqual(calls.deleteInvoicePdfs[0], [
    "invoices/clinic-1/appt-1.pdf",
  ]);
  assert.deepEqual(calls.deleteByAppointmentIds[0].appointmentIds, [
    "appt-1",
    "appt-2",
  ]);
  assert.deepEqual(calls.hardDeleteByPatientIdSessions[0], {
    clinicId: CLINIC,
    patientId: PATIENT.id,
  });
  assert.deepEqual(calls.hardDeleteByPatientIdAppointments[0], {
    clinicId: CLINIC,
    patientId: PATIENT.id,
  });
  assert.deepEqual(calls.hardDeletePatient[0], {
    clinicId: CLINIC,
    patientId: PATIENT.id,
  });
});

test("hardDelete: refuses when a linked appointment is paid and unrefunded", async () => {
  const { service, calls } = createDeps({
    appointments: [{ id: "appt-1", payment_status: "paid" }],
    invoices: [{ id: "inv-1", storage_path: "path.pdf" }],
  });

  await assert.rejects(
    () => service.hardDelete(CLINIC, PATIENT.id),
    (err) =>
      err instanceof PatientRequestError &&
      err.statusCode === 409 &&
      /refund/i.test(err.message),
  );
  assert.equal(calls.deleteByAppointmentIds.length, 0);
  assert.equal(calls.hardDeletePatient.length, 0);
});

test("hardDelete: clinic scoping — cannot delete another clinic's patient", async () => {
  const { service, calls } = createDeps({
    appointments: [{ id: "appt-1", payment_status: "not_required" }],
  });

  await assert.rejects(
    () => service.hardDelete(OTHER_CLINIC, PATIENT.id),
    (err) => err instanceof PatientRequestError && err.statusCode === 404,
  );
  assert.equal(calls.hardDeletePatient.length, 0);
});
