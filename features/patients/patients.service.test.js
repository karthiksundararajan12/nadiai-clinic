import test from "node:test";
import assert from "node:assert/strict";
import { PatientRequestError, PatientsService } from "./patients.service.js";
import { APPOINTMENT_STATUS } from "../booking/constants.js";

const NOW = new Date("2026-07-15T10:00:00.000Z");

const PATIENTS = [
  {
    id: "patient-1",
    full_name: "Karthik Sundar",
    contact_phone: "919840227132",
    age_years: 34,
    gender: "Male",
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
  },
  {
    id: "patient-2",
    full_name: "Asha Kumar",
    contact_phone: "919876543210",
    age_years: null,
    gender: null,
    date_of_birth: "2022-01-01",
    date_of_birth_is_approximate: true,
    created_at: "2026-06-02T10:00:00.000Z",
    updated_at: "2026-06-02T10:00:00.000Z",
  },
];

function createService({ patients = PATIENTS, appointments = [], createResult, vaccinationSeedingService } = {}) {
  const calls = { findAllForClinic: [], findForClinic: [], create: [] };

  const patientRepository = {
    async findAllForClinic(clinicId) {
      calls.findAllForClinic.push(clinicId);
      return patients;
    },
    async create(data) {
      calls.create.push(data);
      return (
        createResult ?? {
          id: "patient-new",
          full_name: data.full_name,
          contact_phone: data.contact_phone,
          age_years: data.age_years ?? null,
          gender: data.gender ?? null,
          date_of_birth: data.date_of_birth ?? null,
          created_at: "2026-07-15T10:00:00.000Z",
        }
      );
    },
  };

  const appointmentRepository = {
    async findForClinic(clinicId, filters) {
      calls.findForClinic.push({ clinicId, filters });
      return appointments;
    },
  };

  return {
    calls,
    service: new PatientsService(patientRepository, appointmentRepository, { vaccinationSeedingService }),
  };
}

function createFakeVaccinationSeedingService({ seedResult, throwError } = {}) {
  const calls = [];
  return {
    calls,
    async seedVaccinationSchedule(params) {
      calls.push(params);
      if (throwError) throw throwError;
      return seedResult ?? { seeded: true, count: 39 };
    },
  };
}

test("list returns clinic patients with last visit from past appointments", async () => {
  const { service } = createService({
    appointments: [
      {
        patient_id: "patient-1",
        slot_start: "2026-07-01T09:00:00.000Z",
        status: APPOINTMENT_STATUS.COMPLETED,
      },
      {
        patient_id: "patient-1",
        slot_start: "2026-07-20T09:00:00.000Z",
        status: APPOINTMENT_STATUS.CONFIRMED,
      },
    ],
  });

  const result = await service.list("clinic-1", NOW);

  assert.equal(result.patients.length, 2);
  assert.equal(result.patients[0].name, "Karthik Sundar");
  assert.equal(result.patients[0].phone, "+91 9840227132");
  assert.equal(result.patients[0].lastVisit, "2026-07-01T09:00:00.000Z");
  assert.equal(result.patients[0].upcomingVisit, "2026-07-20T09:00:00.000Z");
  assert.equal(result.patients[0].dateOfBirthIsApproximate, false); // no date_of_birth_is_approximate on fixture -> defaults false
  assert.equal(result.patients[1].lastVisit, null);
  assert.equal(result.patients[1].dateOfBirth, "2022-01-01");
  assert.equal(result.patients[1].dateOfBirthIsApproximate, true);
  assert.deepEqual(result.stats, {
    totalPatients: 2,
    withUpcomingVisit: 1,
    noAppointmentsYet: 1,
  });
});

test("list ignores cancelled appointments when computing last visit", async () => {
  const { service } = createService({
    appointments: [
      {
        patient_id: "patient-1",
        slot_start: "2026-07-01T09:00:00.000Z",
        status: APPOINTMENT_STATUS.CANCELLED,
      },
    ],
  });

  const result = await service.list("clinic-1", NOW);

  assert.equal(result.patients[0].lastVisit, null);
  assert.equal(result.stats.noAppointmentsYet, 2);
});

test("create writes a validated patient row scoped to the clinic", async () => {
  const { service, calls } = createService();

  const result = await service.create("clinic-1", {
    name: "Karthik Sundar",
    phone: "+91 9840227132",
    age: "34",
    gender: "Male",
  });

  assert.deepEqual(calls.create[0], {
    clinic_id: "clinic-1",
    contact_phone: "919840227132",
    full_name: "Karthik Sundar",
    age_years: 34,
    gender: "Male",
    date_of_birth: null,
  });
  assert.equal(result.patient.name, "Karthik Sundar");
  assert.equal(result.patient.phone, "+91 9840227132");
});

test("create rejects missing names", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.create("clinic-1", {
        name: "   ",
        phone: "9840227132",
      }),
    (error) =>
      error instanceof PatientRequestError &&
      error.statusCode === 400 &&
      /Full name/.test(error.message),
  );
});

test("create rejects invalid phone numbers", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.create("clinic-1", {
        name: "Karthik Sundar",
        phone: "12345",
      }),
    (error) =>
      error instanceof PatientRequestError &&
      error.statusCode === 400 &&
      /Indian mobile/.test(error.message),
  );
});

test("create accepts an optional dateOfBirth and writes it to the patient row", async () => {
  const { service, calls } = createService();

  const result = await service.create("clinic-1", {
    name: "Baby Sundar",
    phone: "9840227132",
    dateOfBirth: "2026-01-15",
  });

  assert.equal(calls.create[0].date_of_birth, "2026-01-15");
  assert.equal(result.patient.dateOfBirth, "2026-01-15");
  // Dashboard-collected DOBs are always exact (a real <input type="date">
  // value), never age-derived — false whether the DB column comes back
  // undefined (fake repo default) or explicitly false.
  assert.equal(result.patient.dateOfBirthIsApproximate, false);
});

test("create surfaces date_of_birth_is_approximate on the returned patient when the repo reports it", async () => {
  const { service } = createService({
    createResult: {
      id: "patient-new",
      full_name: "Baby Sundar",
      contact_phone: "919840227132",
      age_years: null,
      gender: null,
      date_of_birth: "2022-01-01",
      date_of_birth_is_approximate: true,
      created_at: "2026-07-15T10:00:00.000Z",
    },
  });

  const result = await service.create("clinic-1", {
    name: "Baby Sundar",
    phone: "9840227132",
    dateOfBirth: "2022-01-01",
  });

  assert.equal(result.patient.dateOfBirthIsApproximate, true);
});

test("create rejects a malformed dateOfBirth", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.create("clinic-1", {
        name: "Baby Sundar",
        phone: "9840227132",
        dateOfBirth: "not-a-date",
      }),
    (error) =>
      error instanceof PatientRequestError &&
      error.statusCode === 400 &&
      /Date of birth/.test(error.message),
  );
});

test("create rejects a dateOfBirth in the future", async () => {
  const { service } = createService();
  const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await assert.rejects(
    () =>
      service.create("clinic-1", {
        name: "Baby Sundar",
        phone: "9840227132",
        dateOfBirth: future,
      }),
    (error) =>
      error instanceof PatientRequestError &&
      /future/.test(error.message),
  );
});

test("create triggers vaccination schedule auto-seed when a dateOfBirth is provided", async () => {
  const vaccinationSeedingService = createFakeVaccinationSeedingService();
  const { service } = createService({ vaccinationSeedingService });

  await service.create("clinic-1", {
    name: "Baby Sundar",
    phone: "9840227132",
    dateOfBirth: "2026-01-15",
  });

  assert.equal(vaccinationSeedingService.calls.length, 1);
  assert.deepEqual(vaccinationSeedingService.calls[0], {
    patientId: "patient-new",
    clinicId: "clinic-1",
    dateOfBirth: "2026-01-15",
  });
});

test("create does not attempt auto-seed when no dateOfBirth is provided", async () => {
  const vaccinationSeedingService = createFakeVaccinationSeedingService();
  const { service } = createService({ vaccinationSeedingService });

  await service.create("clinic-1", {
    name: "Karthik Sundar",
    phone: "9840227132",
  });

  assert.equal(vaccinationSeedingService.calls.length, 0);
});

test("create succeeds even if vaccination schedule auto-seed throws (best-effort, never blocks patient creation)", async () => {
  const vaccinationSeedingService = createFakeVaccinationSeedingService({
    throwError: new Error("seeding boom"),
  });
  const { service } = createService({ vaccinationSeedingService });

  const result = await service.create("clinic-1", {
    name: "Baby Sundar",
    phone: "9840227132",
    dateOfBirth: "2026-01-15",
  });

  assert.equal(result.patient.name, "Baby Sundar");
  assert.equal(vaccinationSeedingService.calls.length, 1);
});

test("create works without a vaccinationSeedingService configured at all", async () => {
  const { service } = createService();

  const result = await service.create("clinic-1", {
    name: "Baby Sundar",
    phone: "9840227132",
    dateOfBirth: "2026-01-15",
  });

  assert.equal(result.patient.name, "Baby Sundar");
});

test("search returns patients matching name or phone", async () => {
  const { service } = createService({
    appointments: [
      {
        patient_id: "patient-1",
        slot_start: "2026-07-01T09:00:00.000Z",
        status: APPOINTMENT_STATUS.COMPLETED,
      },
    ],
  });

  const byName = await service.search("clinic-1", "karthik", NOW);
  const byPhone = await service.search("clinic-1", "9840227132", NOW);
  const miss = await service.search("clinic-1", "zzzz", NOW);

  assert.equal(byName.patients.length, 1);
  assert.equal(byName.patients[0].name, "Karthik Sundar");
  assert.equal(byPhone.patients.length, 1);
  assert.equal(miss.patients.length, 0);
});

test("listOptions returns id and name for appointment dropdowns", async () => {
  const { service } = createService();

  const options = await service.listOptions("clinic-1");

  assert.deepEqual(options, [
    { id: "patient-1", name: "Karthik Sundar" },
    { id: "patient-2", name: "Asha Kumar" },
  ]);
});
