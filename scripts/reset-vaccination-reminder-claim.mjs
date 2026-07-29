#!/usr/bin/env node
/**
 * @fileoverview One-off admin recovery script: resets a stuck vaccination
 * reminder claim (`reminder_sent` or `reminder_failed`) back to `pending`
 * with a clean attempt counter, so it's picked up again on the next
 * vaccination-reminders cron sweep — see
 * features/vaccinations/vaccination-reminder.service.js (the
 * claim/retry fix this accompanies) and
 * VaccinationRepository.resetClaim.
 *
 * Prior to that fix, a claimed reminder whose WhatsApp send failed could
 * be left stuck at `reminder_sent` forever (claim never released) — this
 * script exists to manually unstick any record that got into that state
 * before the fix shipped. It is safe to re-run and safe to run even after
 * the fix (e.g. to manually retry a `reminder_failed` record once the
 * underlying cause, such as an unapproved template, is resolved).
 *
 * Defaults to a DRY RUN (prints the current row, writes nothing) — pass
 * --execute to actually perform the reset.
 *
 * Usage:
 *   node scripts/reset-vaccination-reminder-claim.mjs --schedule-id=<uuid>            # dry run
 *   node scripts/reset-vaccination-reminder-claim.mjs --schedule-id=<uuid> --execute  # writes
 *
 * Equivalent raw SQL (e.g. to run directly in the Supabase SQL editor
 * instead of via this script):
 *
 *   UPDATE public.vaccination_schedules
 *   SET status = 'pending', reminder_sent_at = NULL, reminder_attempts = 0
 *   WHERE id = '<schedule-id>'
 *     AND status IN ('reminder_sent', 'reminder_failed');
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the
 * environment — loaded from .env.local if present (same pattern as
 * scripts/backfill-vaccination-schedules.mjs).
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: new URL("../.env.local", import.meta.url).pathname });

import { getSupabaseAdminClient } from "../lib/supabase/admin.js";
// Imported directly from its file (not the features/vaccinations barrel,
// which doesn't exist) — see backfill-vaccination-schedules.mjs for why
// plain `node script.mjs` can't resolve the "@/" Next.js path alias some
// of these files' sibling modules use internally.
import { VaccinationRepository } from "../features/vaccinations/vaccination.repository.js";
import { VACCINATION_STATUS } from "../features/vaccinations/constants.js";

const RESETTABLE_STATUSES = new Set([
  VACCINATION_STATUS.REMINDER_SENT,
  VACCINATION_STATUS.REMINDER_FAILED,
]);

/**
 * @param {string[]} argv
 * @returns {{ execute: boolean; scheduleId: string|null }}
 */
export function parseArgs(argv) {
  const args = { execute: false, scheduleId: null };
  for (const arg of argv) {
    if (arg === "--execute" || arg === "--yes") {
      args.execute = true;
    } else if (arg.startsWith("--schedule-id=")) {
      args.scheduleId = arg.slice("--schedule-id=".length).trim() || null;
    }
  }
  return args;
}

/**
 * Core logic, factored out of main() so it's independently testable
 * without a real Supabase connection.
 *
 * @param {{
 *   vaccinationRepository: {
 *     findById: (id: string) => Promise<object|null>;
 *     resetClaim: (id: string) => Promise<object|null>;
 *   };
 *   scheduleId: string;
 *   dryRun: boolean;
 *   log?: (message: string) => void;
 * }} deps
 * @returns {Promise<{ outcome: "not_found"|"not_resettable"|"would_reset"|"reset"; schedule: object|null }>}
 */
export async function resetVaccinationReminderClaim({ vaccinationRepository, scheduleId, dryRun, log = () => {} }) {
  const schedule = await vaccinationRepository.findById(scheduleId);
  if (!schedule) {
    log(`Schedule ${scheduleId} not found.`);
    return { outcome: "not_found", schedule: null };
  }

  log(
    `Found schedule ${scheduleId}: status=${schedule.status}, vaccine=${schedule.vaccine_name}, ` +
      `dueDate=${schedule.due_date}, reminderSentAt=${schedule.reminder_sent_at ?? "null"}, ` +
      `reminderAttempts=${schedule.reminder_attempts ?? 0}`,
  );

  if (!RESETTABLE_STATUSES.has(schedule.status)) {
    log(
      `Schedule is '${schedule.status}', not '${VACCINATION_STATUS.REMINDER_SENT}'/` +
        `'${VACCINATION_STATUS.REMINDER_FAILED}' — nothing to reset.`,
    );
    return { outcome: "not_resettable", schedule };
  }

  if (dryRun) {
    log("[dry-run] Would reset to pending (reminder_sent_at=null, reminder_attempts=0). Re-run with --execute to apply.");
    return { outcome: "would_reset", schedule };
  }

  const updated = await vaccinationRepository.resetClaim(scheduleId);
  if (!updated) {
    log("Reset skipped — schedule's status changed concurrently before the update landed.");
    return { outcome: "not_resettable", schedule };
  }
  log(`Reset complete — schedule ${scheduleId} is now 'pending' and will be retried on the next cron sweep.`);
  return { outcome: "reset", schedule: updated };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.scheduleId) {
    console.error("Usage: node scripts/reset-vaccination-reminder-claim.mjs --schedule-id=<uuid> [--execute]");
    process.exitCode = 1;
    return;
  }
  const dryRun = !args.execute;

  const supabase = getSupabaseAdminClient();
  const vaccinationRepository = new VaccinationRepository(supabase);

  console.log(
    `Vaccination reminder claim reset — ${dryRun ? "DRY RUN (no writes)" : "EXECUTE (writing)"} — schedule ${args.scheduleId}`,
  );
  console.log("");

  await resetVaccinationReminderClaim({
    vaccinationRepository,
    scheduleId: args.scheduleId,
    dryRun,
    log: (message) => console.log(message),
  });
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error("Reset failed:", err);
    process.exitCode = 1;
  });
}
