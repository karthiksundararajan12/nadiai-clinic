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

function createService({
  patients = PATIENTS,
  appointments = [],
  createResult,
  vaccinationSeedingService,
  contacts = [],
} = {}) {
  const calls = { findAllForClinic: [], findForClinic: [], create: [], findByContact: [] };

  const patientRepository = {
    async findAllForClinic(clinicId) {
      calls.findAllForClinic.push(clinicId);
      return patients;
    },
    async findByContact(clinicId, contactPhone) {
      calls.findByContact.push({ clinicId, contactPhone });
      return contacts
        .filter(
          (patient) =>
            patient.clinic_id === clinicId &&
            patient.contact_phone === contactPhone &&
            patient.deleted_at == null,
        )
        .slice()
        .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
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
          consent_given: data.consent_given,
          consent_given_at: data.consent_given_at,
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
    consent_given: false,
    consent_given_at: null,
  });
  assert.deepEqual(calls.findByContact[0], {
    clinicId: "clinic-1",
    contactPhone: "919840227132",
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

const CONSENT_NOW = new Date("2026-10-13T12:30:00.000Z");

const EXISTING_CONTACT = {
  id: "patient-existing",
  clinic_id: "clinic-1",
  contact_phone: "919840227132",
  full_name: "Karthik Sundar",
  created_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

test("create persists consent_given and consent_given_at only when consentGiven is true", async () => {
  const consented = createService();
  await consented.service.create(
    "clinic-1",
    {
      name: "Karthik Sundar",
      phone: "9840227132",
      consentGiven: true,
    },
    CONSENT_NOW,
  );
  assert.equal(consented.calls.create[0].consent_given, true);
  assert.equal(consented.calls.create[0].consent_given_at, "2026-10-13T12:30:00.000Z");

  const declined = createService();
  await declined.service.create(
    "clinic-1",
    {
      name: "Karthik Sundar",
      phone: "9840227132",
      consentGiven: false,
    },
    CONSENT_NOW,
  );
  assert.equal(declined.calls.create[0].consent_given, false);
  assert.equal(declined.calls.create[0].consent_given_at, null);

  const omitted = createService();
  await omitted.service.create(
    "clinic-1",
    {
      name: "Karthik Sundar",
      phone: "9840227132",
      consentGiven: "true",
      consent_given: true,
      consent_given_at: "2020-01-01T00:00:00.000Z",
    },
    CONSENT_NOW,
  );
  assert.equal(omitted.calls.create[0].consent_given, false);
  assert.equal(omitted.calls.create[0].consent_given_at, null);
});

test("create returns 409 when the clinic already has that phone", async () => {
  const vaccinationSeedingService = createFakeVaccinationSeedingService();
  const { service, calls } = createService({
    contacts: [
      {
        id: "patient-younger",
        clinic_id: "clinic-1",
        contact_phone: "919840227132",
        full_name: "Younger Sibling",
        created_at: "2026-06-01T00:00:00.000Z",
        deleted_at: null,
      },
      EXISTING_CONTACT,
      {
        id: "patient-deleted",
        clinic_id: "clinic-1",
        contact_phone: "919840227132",
        full_name: "Deleted Person",
        created_at: "2025-01-01T00:00:00.000Z",
        deleted_at: "2026-02-01T00:00:00.000Z",
      },
    ],
    vaccinationSeedingService,
  });

  await assert.rejects(
    () =>
      service.create("clinic-1", {
        name: "Little Kiran",
        phone: "+91 98402 27132",
        dateOfBirth: "2020-01-01",
      }),
    (error) =>
      error instanceof PatientRequestError &&
      error.statusCode === 409 &&
      error.message === "A patient with this number already exists" &&
      error.existingPatient.id === "patient-existing" &&
      error.existingPatient.full_name === "Karthik Sundar",
  );

  assert.equal(calls.create.length, 0);
  assert.equal(vaccinationSeedingService.calls.length, 0);
  assert.deepEqual(calls.findByContact[0], {
    clinicId: "clinic-1",
    contactPhone: "919840227132",
  });
});

test("create add-anyway inserts a different name on the same phone and still blocks the same name", async () => {
  const { service, calls } = createService({ contacts: [EXISTING_CONTACT] });

  const created = await service.create("clinic-1", {
    name: "Little Kiran",
    phone: "9840227132",
    allowFamilyMember: true,
    consentGiven: true,
  }, CONSENT_NOW);

  assert.equal(created.patient.name, "Little Kiran");
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].clinic_id, "clinic-1");
  assert.equal(calls.create[0].contact_phone, "919840227132");
  assert.equal(calls.create[0].full_name, "Little Kiran");
  assert.equal(calls.create[0].consent_given, true);
  assert.equal(calls.create[0].consent_given_at, "2026-10-13T12:30:00.000Z");

  await assert.rejects(
    () =>
      service.create("clinic-1", {
        name: "  karthik   sundar ",
        phone: "919840227132",
        allowFamilyMember: true,
      }),
    (error) =>
      error instanceof PatientRequestError &&
      error.statusCode === 409 &&
      error.existingPatient.id === "patient-existing" &&
      error.existingPatient.full_name === "Karthik Sundar",
  );
  assert.equal(calls.create.length, 1);

  await assert.rejects(
    () =>
      service.create("clinic-1", {
        name: "Another Child",
        phone: "9840227132",
        allowFamilyMember: "true",
      }),
    (error) => error instanceof PatientRequestError && error.statusCode === 409,
  );
  assert.equal(calls.create.length, 1);
});

test("create scopes the duplicate lookup to the requesting clinic and ignores deleted patients", async () => {
  const { service, calls } = createService({
    contacts: [
      {
        id: "other-clinic",
        clinic_id: "clinic-2",
        contact_phone: "919840227132",
        full_name: "Other Clinic Patient",
        created_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null,
      },
      {
        id: "deleted-here",
        clinic_id: "clinic-1",
        contact_phone: "919840227132",
        full_name: "Deleted Here",
        created_at: "2026-01-01T00:00:00.000Z",
        deleted_at: "2026-03-01T00:00:00.000Z",
      },
    ],
  });

  const result = await service.create("clinic-1", {
    name: "New Patient",
    phone: "9840227132",
    clinicId: "clinic-2",
    clinic_id: "clinic-2",
  });

  assert.equal(result.patient.name, "New Patient");
  assert.equal(calls.findByContact[0].clinicId, "clinic-1");
  assert.equal(calls.create[0].clinic_id, "clinic-1");
  assert.equal(calls.create.length, 1);
});
