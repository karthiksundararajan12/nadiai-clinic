#!/usr/bin/env node
/**
 * @fileoverview One-time backfill: seeds vaccination_schedules (the
 * standard IAP immunization schedule) for existing pediatric patients who
 * already have a date_of_birth on file, registered before auto-seed
 * shipped on patient creation (see
 * features/patients/patients.service.js -> VaccinationSeedingService).
 *
 * Idempotent — safe to re-run. Every patient goes through the exact same
 * VaccinationSeedingService.seedVaccinationSchedule gates the live
 * patient-creation path uses (pediatric clinic check, existing-rows check,
 * future-only due-date filter), so re-running this script never
 * double-seeds a patient.
 *
 * Defaults to a DRY RUN (no writes) — pass --execute to actually insert
 * rows. See the bottom of this file / the project README for the
 * recommended way to run this against prod.
 *
 * Usage:
 *   node scripts/backfill-vaccination-schedules.mjs                     # dry run, all clinics
 *   node scripts/backfill-vaccination-schedules.mjs --execute           # writes rows, all clinics
 *   node scripts/backfill-vaccination-schedules.mjs --clinic-id=<uuid>  # scope to one clinic (dry run)
 *   node scripts/backfill-vaccination-schedules.mjs --clinic-id=<uuid> --execute
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the
 * environment — loaded from .env.local if present (same pattern as
 * scripts/soap-prompt-compare.mjs).
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: new URL("../.env.local", import.meta.url).pathname });

import { getSupabaseAdminClient } from "../lib/supabase/admin.js";
// Imported directly from their files (not the features/booking barrel) —
// the barrel's factory section pulls in "@/lib/supabase/admin" via the
// Next.js "@/" path alias, which plain `node script.mjs` execution (no
// Next.js/webpack resolver) cannot resolve.
import { ClinicRepository } from "../features/booking/repository/clinic.repository.js";
import { PatientRepository } from "../features/booking/repository/patient.repository.js";
import { DoctorProfileRepository } from "../features/booking/repository/doctor-profile.repository.js";
import { VaccinationRepository } from "../features/vaccinations/vaccination.repository.js";
import { VaccinationSeedingService } from "../features/vaccinations/vaccination-seeding.service.js";

/**
 * @param {string[]} argv
 * @returns {{ execute: boolean; clinicId: string|null }}
 */
export function parseArgs(argv) {
  const args = { execute: false, clinicId: null };
  for (const arg of argv) {
    if (arg === "--execute" || arg === "--yes") {
      args.execute = true;
    } else if (arg.startsWith("--clinic-id=")) {
      args.clinicId = arg.slice("--clinic-id=".length).trim() || null;
    }
  }
  return args;
}

/**
 * Core backfill loop, factored out of main() so it's independently
 * testable with fake repositories/service (no real Supabase connection
 * required).
 *
 * @param {{
 *   clinicRepository: { findAllIds: () => Promise<Array<{ id: string; name?: string }>> };
 *   patientRepository: { findAllForClinic: (clinicId: string) => Promise<Array<{ id: string; date_of_birth: string|null }>> };
 *   seedingService: import("../features/vaccinations/vaccination-seeding.service.js").VaccinationSeedingService;
 *   dryRun: boolean;
 *   clinicId?: string|null;
 *   now?: Date;
 *   log?: (message: string) => void;
 * }} deps
 * @returns {Promise<{
 *   clinicsScanned: number;
 *   pediatricClinics: number;
 *   patientsScanned: number;
 *   seeded: number;
 *   seededDoses: number;
 *   dryRunWouldSeed: number;
 *   skipped: Record<string, number>;
 *   errors: number;
 * }>}
 */
export async function runBackfill({
  clinicRepository,
  patientRepository,
  seedingService,
  dryRun,
  clinicId = null,
  now = new Date(),
  log = () => {},
}) {
  const clinics = clinicId ? [{ id: clinicId }] : await clinicRepository.findAllIds();

  const summary = {
    clinicsScanned: 0,
    pediatricClinics: 0,
    patientsScanned: 0,
    seeded: 0,
    seededDoses: 0,
    dryRunWouldSeed: 0,
    skipped: {},
    errors: 0,
  };

  for (const clinic of clinics) {
    summary.clinicsScanned += 1;

    let isPediatric;
    try {
      isPediatric = await seedingService.isPediatricClinic(clinic.id);
    } catch (err) {
      summary.errors += 1;
      log(`  [error] clinic ${clinic.id}: failed to check specialization — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (!isPediatric) continue;
    summary.pediatricClinics += 1;

    const patients = await patientRepository.findAllForClinic(clinic.id);
    for (const patient of patients) {
      summary.patientsScanned += 1;
      try {
        const result = await seedingService.seedVaccinationSchedule({
          patientId: patient.id,
          clinicId: clinic.id,
          dateOfBirth: patient.date_of_birth ?? null,
          now,
          dryRun,
        });

        if (result.seeded) {
          summary.seeded += 1;
          summary.seededDoses += result.count ?? 0;
          log(`  seeded ${result.count} doses for patient ${patient.id} (clinic ${clinic.id})`);
        } else if (result.reason === "DRY_RUN") {
          summary.dryRunWouldSeed += 1;
          log(`  [dry-run] would seed ${result.count} doses for patient ${patient.id} (clinic ${clinic.id})`);
        } else {
          summary.skipped[result.reason] = (summary.skipped[result.reason] ?? 0) + 1;
        }
      } catch (err) {
        summary.errors += 1;
        log(`  [error] patient ${patient.id} (clinic ${clinic.id}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = !args.execute;

  const supabase = getSupabaseAdminClient();
  const clinicRepository = new ClinicRepository(supabase);
  const patientRepository = new PatientRepository(supabase);
  const doctorProfileRepository = new DoctorProfileRepository(supabase);
  const vaccinationRepository = new VaccinationRepository(supabase);
  const seedingService = new VaccinationSeedingService(vaccinationRepository, doctorProfileRepository);

  console.log(
    `Vaccination schedule backfill — ${dryRun ? "DRY RUN (no writes)" : "EXECUTE (writing rows)"}` +
      (args.clinicId ? ` — clinic ${args.clinicId} only` : " — all clinics"),
  );
  console.log("");

  const summary = await runBackfill({
    clinicRepository,
    patientRepository,
    seedingService,
    dryRun,
    clinicId: args.clinicId,
    log: (message) => console.log(message),
  });

  console.log("\nSummary:");
  console.log(JSON.stringify(summary, null, 2));

  if (dryRun) {
    console.log(
      `\nThis was a DRY RUN — no rows were written. ${summary.dryRunWouldSeed} patient(s) would be seeded. Re-run with --execute to write them.`,
    );
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  });
}
