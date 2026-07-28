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
};

function createService({ patient = PATIENT, listResult, createResult } = {}) {
  const calls = { listForClinic: [], create: [], findById: [] };

  const vaccinationRepository = {
    async listForClinic(clinicId, filters) {
      calls.listForClinic.push({ clinicId, filters });
      return listResult ?? { rows: [], total: 0 };
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
  assert.equal(result.total, 1);
  assert.equal(result.hasMore, false);
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
});
