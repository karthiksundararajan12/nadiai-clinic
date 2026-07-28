import test from "node:test";
import assert from "node:assert/strict";
import { VaccinationSeedingService } from "./vaccination-seeding.service.js";
import { IAP_IMMUNIZATION_SCHEDULE, addDaysToDateString } from "../../lib/iap-schedule.js";

function createFakeVaccinationRepo({ existing = new Set() } = {}) {
  const bulkCreateCalls = [];
  return {
    bulkCreateCalls,
    async existsForPatient(patientId) {
      return existing.has(patientId);
    },
    async bulkCreate(entries) {
      bulkCreateCalls.push(entries);
      return entries.map((e, i) => ({ id: `row-${i}`, ...e }));
    },
  };
}

function createFakeDoctorProfileRepo(specializationByClinic = {}) {
  return {
    async findPrimarySpecializationByClinicId(clinicId) {
      return specializationByClinic[clinicId] ?? null;
    },
  };
}

test("isPediatricClinic matches 'Pediatrician'/'Paediatrician' case-insensitively", async () => {
  const service = new VaccinationSeedingService(
    createFakeVaccinationRepo(),
    createFakeDoctorProfileRepo({
      "clinic-peds": "Pediatrician",
      "clinic-peds-uk": "paediatrician",
      "clinic-peds-loud": "PEDIATRICIAN",
      "clinic-cardio": "Cardiologist",
      "clinic-none": null,
    }),
  );

  assert.equal(await service.isPediatricClinic("clinic-peds"), true);
  assert.equal(await service.isPediatricClinic("clinic-peds-uk"), true);
  assert.equal(await service.isPediatricClinic("clinic-peds-loud"), true);
  assert.equal(await service.isPediatricClinic("clinic-cardio"), false);
  assert.equal(await service.isPediatricClinic("clinic-none"), false);
});

test("seedVaccinationSchedule produces one row per IAP schedule entry with correct due_dates for a given date_of_birth", async () => {
  const vaccinationRepo = createFakeVaccinationRepo();
  const service = new VaccinationSeedingService(
    vaccinationRepo,
    createFakeDoctorProfileRepo({ "clinic-1": "Pediatrician" }),
  );

  const dateOfBirth = "2026-07-01";
  // "now" == date_of_birth, so every IAP dose (offsetDays >= 0) is upcoming.
  const now = new Date("2026-07-01T00:00:00.000Z");

  const result = await service.seedVaccinationSchedule({
    patientId: "patient-1",
    clinicId: "clinic-1",
    dateOfBirth,
    now,
  });

  assert.equal(result.seeded, true);
  assert.equal(result.count, IAP_IMMUNIZATION_SCHEDULE.length);
  assert.equal(vaccinationRepo.bulkCreateCalls.length, 1);

  const entries = vaccinationRepo.bulkCreateCalls[0];
  assert.equal(entries.length, IAP_IMMUNIZATION_SCHEDULE.length);
  entries.forEach((entry, i) => {
    assert.equal(entry.clinicId, "clinic-1");
    assert.equal(entry.patientId, "patient-1");
    assert.equal(entry.vaccineName, IAP_IMMUNIZATION_SCHEDULE[i].vaccineName);
    assert.equal(entry.dueDate, addDaysToDateString(dateOfBirth, IAP_IMMUNIZATION_SCHEDULE[i].offsetDays));
  });

  // Spot-check the birth dose lands exactly on date_of_birth.
  assert.equal(entries.find((e) => e.vaccineName === "BCG").dueDate, "2026-07-01");
});

test("seedVaccinationSchedule only seeds doses due today or later, skipping doses already in the past for an older child", async () => {
  const vaccinationRepo = createFakeVaccinationRepo();
  const service = new VaccinationSeedingService(
    vaccinationRepo,
    createFakeDoctorProfileRepo({ "clinic-1": "Pediatrician" }),
  );

  // A 10-year-old: birth/6-week/.../4-6yr booster doses are all far in the
  // past by "now" — only the 10-12yr HPV-2 dose (offsetDays 3835, due
  // 2026-12-31) is still within the future/grace window.
  const dateOfBirth = "2016-07-01";
  const now = new Date("2026-07-16T00:00:00.000Z");

  const result = await service.seedVaccinationSchedule({
    patientId: "patient-old",
    clinicId: "clinic-1",
    dateOfBirth,
    now,
  });

  assert.equal(result.seeded, true);
  const entries = vaccinationRepo.bulkCreateCalls[0];
  assert.ok(entries.length > 0);
  assert.ok(entries.length < IAP_IMMUNIZATION_SCHEDULE.length);
  for (const entry of entries) {
    assert.ok(entry.dueDate >= "2026-07-09"); // now minus the 7-day grace window
  }
  assert.equal(entries.some((e) => e.vaccineName === "BCG"), false);
});

test("seedVaccinationSchedule is skipped (NOT_PEDIATRIC_CLINIC) for a non-pediatric clinic, even with a date_of_birth on file", async () => {
  const vaccinationRepo = createFakeVaccinationRepo();
  const service = new VaccinationSeedingService(
    vaccinationRepo,
    createFakeDoctorProfileRepo({ "clinic-cardio": "Cardiologist" }),
  );

  const result = await service.seedVaccinationSchedule({
    patientId: "patient-1",
    clinicId: "clinic-cardio",
    dateOfBirth: "2026-01-01",
  });

  assert.deepEqual(result, { seeded: false, reason: "NOT_PEDIATRIC_CLINIC" });
  assert.equal(vaccinationRepo.bulkCreateCalls.length, 0);
});

test("seedVaccinationSchedule is skipped (NO_DATE_OF_BIRTH) when the patient has no date_of_birth", async () => {
  const vaccinationRepo = createFakeVaccinationRepo();
  const service = new VaccinationSeedingService(
    vaccinationRepo,
    createFakeDoctorProfileRepo({ "clinic-1": "Pediatrician" }),
  );

  const result = await service.seedVaccinationSchedule({
    patientId: "patient-1",
    clinicId: "clinic-1",
    dateOfBirth: null,
  });

  assert.deepEqual(result, { seeded: false, reason: "NO_DATE_OF_BIRTH" });
  assert.equal(vaccinationRepo.bulkCreateCalls.length, 0);
});

test("seedVaccinationSchedule is skipped (ALREADY_SEEDED) when the patient already has any vaccination_schedules rows", async () => {
  const vaccinationRepo = createFakeVaccinationRepo({ existing: new Set(["patient-1"]) });
  const service = new VaccinationSeedingService(
    vaccinationRepo,
    createFakeDoctorProfileRepo({ "clinic-1": "Pediatrician" }),
  );

  const result = await service.seedVaccinationSchedule({
    patientId: "patient-1",
    clinicId: "clinic-1",
    dateOfBirth: "2026-01-01",
  });

  assert.deepEqual(result, { seeded: false, reason: "ALREADY_SEEDED" });
  assert.equal(vaccinationRepo.bulkCreateCalls.length, 0);
});

test("seedVaccinationSchedule with dryRun previews the count without writing any rows", async () => {
  const vaccinationRepo = createFakeVaccinationRepo();
  const service = new VaccinationSeedingService(
    vaccinationRepo,
    createFakeDoctorProfileRepo({ "clinic-1": "Pediatrician" }),
  );

  const result = await service.seedVaccinationSchedule({
    patientId: "patient-1",
    clinicId: "clinic-1",
    dateOfBirth: "2026-07-01",
    now: new Date("2026-07-01T00:00:00.000Z"),
    dryRun: true,
  });

  assert.equal(result.seeded, false);
  assert.equal(result.reason, "DRY_RUN");
  assert.equal(result.count, IAP_IMMUNIZATION_SCHEDULE.length);
  assert.equal(vaccinationRepo.bulkCreateCalls.length, 0);
});
