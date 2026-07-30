import test from "node:test";
import assert from "node:assert/strict";
import { VaccinationRequestError, VaccinationsService } from "./vaccinations.service.js";

const CLINIC_A = "clinic-a";
const CLINIC_B = "clinic-b";

const PATIENT = {
  id: "patient-1",
  clinic_id: CLINIC_A,
  full_name: "Asha Kumar",
  contact_phone: "919876543210",
  date_of_birth: "2022-01-01",
  date_of_birth_is_approximate: true,
};

function createService({ patient = PATIENT, listResult, createResult, listForPatientResult } = {}) {
  const calls = { listForClinic: [], create: [], findById: [], listForPatient: [] };

  const vaccinationRepository = {
    async listForClinic(clinicId, filters) {
      calls.listForClinic.push({ clinicId, filters });
      return listResult ?? { rows: [], total: 0 };
    },
    async listForPatient(clinicId, patientId) {
      calls.listForPatient.push({ clinicId, patientId });
      return listForPatientResult ?? [];
    },
    async create(data) {
      calls.create.push(data);
      return (
        createResult ?? {
          id: "vacc-new",
          patient_id: data.patientId,
          vaccine_name: data.vaccineName,
          due_date: data.dueDate,
          status: "pending",
          reminder_sent_at: null,
          completed_at: null,
          created_at: "2026-07-15T10:00:00.000Z",
        }
      );
    },
  };

  const patientRepository = {
    async findById(clinicId, patientId) {
      calls.findById.push({ clinicId, patientId });
      // Tenancy: only resolve the patient when the clinic matches.
      if (clinicId !== patient.clinic_id) return null;
      if (patientId !== patient.id) return null;
      return patient;
    },
  };

  return {
    calls,
    service: new VaccinationsService(vaccinationRepository, patientRepository),
  };
}

test("list scopes lookups to the requesting clinic and applies safe pagination defaults", async () => {
  const { service, calls } = createService({
    listResult: {
      rows: [
        {
          id: "vacc-1",
          patient_id: "patient-1",
          patient_name: "Asha Kumar",
          patient_date_of_birth_is_approximate: true,
          vaccine_name: "MMR (2nd dose)",
          due_date: "2026-08-01",
          status: "pending",
          reminder_sent_at: null,
          completed_at: null,
          created_at: "2026-07-01T10:00:00.000Z",
        },
      ],
      total: 1,
    },
  });

  const result = await service.list(CLINIC_A, { status: "pending", range: "week" });

  assert.equal(calls.listForClinic[0].clinicId, CLINIC_A);
  assert.equal(calls.listForClinic[0].filters.status, "pending");
  assert.equal(calls.listForClinic[0].filters.limit, 20);
  assert.equal(calls.listForClinic[0].filters.offset, 0);
  assert.equal(result.vaccinations.length, 1);
  assert.equal(result.vaccinations[0].patientName, "Asha Kumar");
  assert.equal(result.vaccinations[0].statusLabel, "Pending");
  // The linked patient's DOB is approximate (age-derived) -> the due date
  // computed from it inherits that uncertainty, surfaced to the dashboard.
  assert.equal(result.vaccinations[0].patientDateOfBirthIsApproximate, true);
  assert.equal(result.total, 1);
  assert.equal(result.hasMore, false);
});

test("list defaults patientDateOfBirthIsApproximate to false when the DB doesn't report it", async () => {
  const { service } = createService({
    listResult: {
      rows: [
        {
          id: "vacc-1",
          patient_id: "patient-1",
          patient_name: "Asha Kumar",
          vaccine_name: "MMR (2nd dose)",
          due_date: "2026-08-01",
          status: "pending",
          reminder_sent_at: null,
          completed_at: null,
          created_at: "2026-07-01T10:00:00.000Z",
        },
      ],
      total: 1,
    },
  });

  const result = await service.list(CLINIC_A);

  assert.equal(result.vaccinations[0].patientDateOfBirthIsApproximate, false);
});

test("list clamps limit to the 1-100 range and offset to a non-negative number", async () => {
  const { service, calls } = createService();

  await service.list(CLINIC_A, { limit: 500, offset: -5 });
  assert.equal(calls.listForClinic[0].filters.limit, 100);
  assert.equal(calls.listForClinic[0].filters.offset, 0);

  await service.list(CLINIC_A, { limit: 0 });
  assert.equal(calls.listForClinic[1].filters.limit, 20);
});

test("list maps status=all to no DB filter", async () => {
  const { service, calls } = createService();

  await service.list(CLINIC_A, { status: "all" });

  assert.equal(calls.listForClinic[0].filters.status, null);
});

test("create validates patient, vaccine name, and due date", async () => {
  const { service } = createService();

  await assert.rejects(
    () => service.create(CLINIC_A, { vaccineName: "MMR", dueDate: "2026-08-01" }),
    (error) => error instanceof VaccinationRequestError && /patientId/.test(error.message),
  );

  await assert.rejects(
    () => service.create(CLINIC_A, { patientId: "patient-1", dueDate: "2026-08-01" }),
    (error) =>
      error instanceof VaccinationRequestError &&
      error.statusCode === 400 &&
      /Vaccine name/.test(error.message),
  );

  await assert.rejects(
    () => service.create(CLINIC_A, { patientId: "patient-1", vaccineName: "MMR", dueDate: "not-a-date" }),
    (error) =>
      error instanceof VaccinationRequestError &&
      error.statusCode === 400 &&
      /due date/.test(error.message),
  );
});

test("create is scoped to the clinic — a patient from another clinic is rejected as not found", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.create(CLINIC_B, {
        patientId: "patient-1",
        vaccineName: "MMR",
        dueDate: "2026-08-01",
      }),
    (error) => error instanceof VaccinationRequestError && error.statusCode === 404,
  );
});

test("create writes a validated vaccination row and returns the formatted result", async () => {
  const { service, calls } = createService();

  const result = await service.create(CLINIC_A, {
    patientId: "patient-1",
    vaccineName: "  MMR (2nd dose)  ",
    dueDate: "2026-08-01",
  });

  assert.deepEqual(calls.create[0], {
    clinicId: CLINIC_A,
    patientId: "patient-1",
    vaccineName: "MMR (2nd dose)",
    dueDate: "2026-08-01",
  });
  assert.equal(result.vaccination.patientName, "Asha Kumar");
  assert.equal(result.vaccination.vaccineName, "MMR (2nd dose)");
  assert.equal(result.vaccination.status, "pending");
  assert.equal(result.vaccination.statusLabel, "Pending");
  // Carried over from the separately-looked-up patient (PATIENT fixture has
  // date_of_birth_is_approximate: true), since the freshly-inserted
  // vaccination_schedules row has no patient join of its own.
  assert.equal(result.vaccination.patientDateOfBirthIsApproximate, true);
});

test("listForPatient returns the clinic-scoped patient's schedule with patient fields overlaid", async () => {
  const { service, calls } = createService({
    listForPatientResult: [
      {
        id: "vacc-1",
        patient_id: "patient-1",
        vaccine_name: "BCG",
        due_date: "2026-01-15",
        status: "completed",
        reminder_sent_at: null,
        completed_at: "2026-01-16T00:00:00.000Z",
        created_at: "2025-12-01T10:00:00.000Z",
      },
    ],
  });

  const result = await service.listForPatient(CLINIC_A, "patient-1");

  assert.equal(calls.findById[0].clinicId, CLINIC_A);
  assert.equal(calls.findById[0].patientId, "patient-1");
  assert.equal(calls.listForPatient[0].clinicId, CLINIC_A);
  assert.equal(calls.listForPatient[0].patientId, "patient-1");
  assert.equal(result.length, 1);
  assert.equal(result[0].vaccineName, "BCG");
  assert.equal(result[0].statusLabel, "Completed");
  assert.equal(result[0].patientName, "Asha Kumar");
  assert.equal(result[0].patientDateOfBirthIsApproximate, true);
});

test("listForPatient is scoped to the clinic — a patient from another clinic 404s", async () => {
  const { service } = createService();

  await assert.rejects(
    () => service.listForPatient(CLINIC_B, "patient-1"),
    (error) => error instanceof VaccinationRequestError && error.statusCode === 404,
  );
});
