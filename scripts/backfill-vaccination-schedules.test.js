import test from "node:test";
import assert from "node:assert/strict";
import { runBackfill, parseArgs } from "./backfill-vaccination-schedules.mjs";
import { VaccinationSeedingService } from "../features/vaccinations/vaccination-seeding.service.js";
import { IAP_IMMUNIZATION_SCHEDULE } from "../lib/iap-schedule.js";

function createFakeClinicRepo(clinics) {
  return { async findAllIds() { return clinics; } };
}

function createFakePatientRepo(patientsByClinic) {
  return {
    async findAllForClinic(clinicId) {
      return patientsByClinic[clinicId] ?? [];
    },
  };
}

function createFakeDoctorProfileRepo(specializationByClinic) {
  return {
    async findPrimarySpecializationByClinicId(clinicId) {
      return specializationByClinic[clinicId] ?? null;
    },
  };
}

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

test("parseArgs recognizes --execute, --yes, and --clinic-id=", () => {
  assert.deepEqual(parseArgs([]), { execute: false, clinicId: null });
  assert.deepEqual(parseArgs(["--execute"]), { execute: true, clinicId: null });
  assert.deepEqual(parseArgs(["--yes"]), { execute: true, clinicId: null });
  assert.deepEqual(parseArgs(["--clinic-id=clinic-1"]), { execute: false, clinicId: "clinic-1" });
  assert.deepEqual(parseArgs(["--clinic-id=clinic-1", "--execute"]), { execute: true, clinicId: "clinic-1" });
});

test("runBackfill seeds every pediatric patient with a date_of_birth across all clinics", async () => {
  const clinicRepository = createFakeClinicRepo([
    { id: "clinic-peds" },
    { id: "clinic-cardio" },
  ]);
  const patientRepository = createFakePatientRepo({
    "clinic-peds": [
      { id: "patient-1", date_of_birth: "2026-07-01" },
      { id: "patient-2", date_of_birth: "2026-07-01" },
    ],
    "clinic-cardio": [{ id: "patient-3", date_of_birth: "2026-07-01" }],
  });
  const doctorProfileRepository = createFakeDoctorProfileRepo({
    "clinic-peds": "Pediatrician",
    "clinic-cardio": "Cardiologist",
  });
  const vaccinationRepository = createFakeVaccinationRepo();
  const seedingService = new VaccinationSeedingService(vaccinationRepository, doctorProfileRepository);

  // now == date_of_birth so every IAP dose (offsetDays >= 0) is "upcoming",
  // making the full-schedule count assertion below deterministic.
  const summary = await runBackfill({
    clinicRepository,
    patientRepository,
    seedingService,
    dryRun: false,
    now: new Date("2026-07-01T00:00:00.000Z"),
  });

  assert.equal(summary.clinicsScanned, 2);
  assert.equal(summary.pediatricClinics, 1);
  // Only clinic-peds's 2 patients are scanned — the non-pediatric clinic's
  // patient list is never even fetched/counted against patientsScanned.
  assert.equal(summary.patientsScanned, 2);
  assert.equal(summary.seeded, 2);
  assert.equal(summary.seededDoses, IAP_IMMUNIZATION_SCHEDULE.length * 2);
  assert.equal(summary.errors, 0);
  assert.equal(vaccinationRepository.bulkCreateCalls.length, 2);
});

test("runBackfill is idempotent — skips patients who already have vaccination_schedules rows", async () => {
  const clinicRepository = createFakeClinicRepo([{ id: "clinic-peds" }]);
  const patientRepository = createFakePatientRepo({
    "clinic-peds": [
      { id: "already-seeded", date_of_birth: "2026-07-01" },
      { id: "not-seeded-yet", date_of_birth: "2026-07-01" },
    ],
  });
  const doctorProfileRepository = createFakeDoctorProfileRepo({ "clinic-peds": "Pediatrician" });
  const vaccinationRepository = createFakeVaccinationRepo({ existing: new Set(["already-seeded"]) });
  const seedingService = new VaccinationSeedingService(vaccinationRepository, doctorProfileRepository);

  const summary = await runBackfill({
    clinicRepository,
    patientRepository,
    seedingService,
    dryRun: false,
    now: new Date("2026-07-01T00:00:00.000Z"),
  });

  assert.equal(summary.patientsScanned, 2);
  assert.equal(summary.seeded, 1);
  assert.equal(summary.skipped.ALREADY_SEEDED, 1);
  // Only one bulkCreate call — for the not-yet-seeded patient.
  assert.equal(vaccinationRepository.bulkCreateCalls.length, 1);
  assert.equal(vaccinationRepository.bulkCreateCalls[0][0].patientId, "not-seeded-yet");
});

test("runBackfill re-run after a real run seeds nothing new (fully idempotent)", async () => {
  const clinicRepository = createFakeClinicRepo([{ id: "clinic-peds" }]);
  const patientRepository = createFakePatientRepo({
    "clinic-peds": [{ id: "patient-1", date_of_birth: "2026-07-01" }],
  });
  const doctorProfileRepository = createFakeDoctorProfileRepo({ "clinic-peds": "Pediatrician" });
  const vaccinationRepository = createFakeVaccinationRepo();
  const seedingService = new VaccinationSeedingService(vaccinationRepository, doctorProfileRepository);

  const now = new Date("2026-07-01T00:00:00.000Z");
  const runDeps = { clinicRepository, patientRepository, seedingService, dryRun: false, now };

  const first = await runBackfill(runDeps);
  assert.equal(first.seeded, 1);

  // Simulate the freshly-inserted rows now existing for the next run.
  const vaccinationRepositoryAfter = createFakeVaccinationRepo({ existing: new Set(["patient-1"]) });
  const seedingServiceAfter = new VaccinationSeedingService(vaccinationRepositoryAfter, doctorProfileRepository);

  const second = await runBackfill({ ...runDeps, seedingService: seedingServiceAfter });
  assert.equal(second.seeded, 0);
  assert.equal(second.skipped.ALREADY_SEEDED, 1);
  assert.equal(vaccinationRepositoryAfter.bulkCreateCalls.length, 0);
});

test("runBackfill dry run reports what would be seeded without writing any rows", async () => {
  const clinicRepository = createFakeClinicRepo([{ id: "clinic-peds" }]);
  const patientRepository = createFakePatientRepo({
    "clinic-peds": [{ id: "patient-1", date_of_birth: "2026-07-01" }],
  });
  const doctorProfileRepository = createFakeDoctorProfileRepo({ "clinic-peds": "Pediatrician" });
  const vaccinationRepository = createFakeVaccinationRepo();
  const seedingService = new VaccinationSeedingService(vaccinationRepository, doctorProfileRepository);

  const summary = await runBackfill({
    clinicRepository,
    patientRepository,
    seedingService,
    dryRun: true,
    now: new Date("2026-07-01T00:00:00.000Z"),
  });

  assert.equal(summary.seeded, 0);
  assert.equal(summary.dryRunWouldSeed, 1);
  assert.equal(vaccinationRepository.bulkCreateCalls.length, 0);
});

test("runBackfill scoped to a single --clinic-id only scans that clinic", async () => {
  const clinicRepository = createFakeClinicRepo([{ id: "clinic-a" }, { id: "clinic-b" }]);
  const patientRepository = createFakePatientRepo({
    "clinic-a": [{ id: "patient-a", date_of_birth: "2026-07-01" }],
    "clinic-b": [{ id: "patient-b", date_of_birth: "2026-07-01" }],
  });
  const doctorProfileRepository = createFakeDoctorProfileRepo({
    "clinic-a": "Pediatrician",
    "clinic-b": "Pediatrician",
  });
  const vaccinationRepository = createFakeVaccinationRepo();
  const seedingService = new VaccinationSeedingService(vaccinationRepository, doctorProfileRepository);

  const summary = await runBackfill({
    clinicRepository,
    patientRepository,
    seedingService,
    dryRun: false,
    clinicId: "clinic-b",
    now: new Date("2026-07-01T00:00:00.000Z"),
  });

  assert.equal(summary.clinicsScanned, 1);
  assert.equal(summary.seeded, 1);
  assert.equal(vaccinationRepository.bulkCreateCalls[0][0].clinicId, "clinic-b");
});
