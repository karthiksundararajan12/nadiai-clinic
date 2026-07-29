import test from "node:test";
import assert from "node:assert/strict";
import { resetVaccinationReminderClaim, parseArgs } from "./reset-vaccination-reminder-claim.mjs";
import { VACCINATION_STATUS } from "../features/vaccinations/constants.js";

function createFakeVaccinationRepo(rowsById) {
  const resetClaimCalls = [];
  return {
    resetClaimCalls,
    async findById(id) {
      const row = rowsById.get(id);
      return row ? { ...row } : null;
    },
    async resetClaim(id) {
      resetClaimCalls.push(id);
      const row = rowsById.get(id);
      if (!row || ![VACCINATION_STATUS.REMINDER_SENT, VACCINATION_STATUS.REMINDER_FAILED].includes(row.status)) {
        return null;
      }
      row.status = VACCINATION_STATUS.PENDING;
      row.reminder_sent_at = null;
      row.reminder_attempts = 0;
      return { ...row };
    },
  };
}

test("parseArgs recognizes --execute, --yes, and --schedule-id=", () => {
  assert.deepEqual(parseArgs([]), { execute: false, scheduleId: null });
  assert.deepEqual(parseArgs(["--execute"]), { execute: true, scheduleId: null });
  assert.deepEqual(parseArgs(["--yes"]), { execute: true, scheduleId: null });
  assert.deepEqual(parseArgs(["--schedule-id=abc-123"]), { execute: false, scheduleId: "abc-123" });
  assert.deepEqual(
    parseArgs(["--schedule-id=abc-123", "--execute"]),
    { execute: true, scheduleId: "abc-123" },
  );
});

test("resets a stuck reminder_sent schedule back to pending when --execute is passed", async () => {
  const rows = new Map([
    [
      "sched-1",
      {
        id: "sched-1",
        status: VACCINATION_STATUS.REMINDER_SENT,
        reminder_sent_at: "2026-07-29T00:00:00.000Z",
        reminder_attempts: 1,
        vaccine_name: "DPT",
        due_date: "2026-07-31",
      },
    ],
  ]);
  const vaccinationRepository = createFakeVaccinationRepo(rows);

  const result = await resetVaccinationReminderClaim({
    vaccinationRepository,
    scheduleId: "sched-1",
    dryRun: false,
  });

  assert.equal(result.outcome, "reset");
  assert.equal(vaccinationRepository.resetClaimCalls.length, 1);
  assert.equal(rows.get("sched-1").status, VACCINATION_STATUS.PENDING);
  assert.equal(rows.get("sched-1").reminder_sent_at, null);
  assert.equal(rows.get("sched-1").reminder_attempts, 0);
});

test("resets a permanently-failed reminder_failed schedule back to pending for a manual retry", async () => {
  const rows = new Map([
    [
      "sched-2",
      {
        id: "sched-2",
        status: VACCINATION_STATUS.REMINDER_FAILED,
        reminder_sent_at: "2026-07-20T00:00:00.000Z",
        reminder_attempts: 3,
        vaccine_name: "MMR",
        due_date: "2026-07-25",
      },
    ],
  ]);
  const vaccinationRepository = createFakeVaccinationRepo(rows);

  const result = await resetVaccinationReminderClaim({
    vaccinationRepository,
    scheduleId: "sched-2",
    dryRun: false,
  });

  assert.equal(result.outcome, "reset");
  assert.equal(rows.get("sched-2").status, VACCINATION_STATUS.PENDING);
  assert.equal(rows.get("sched-2").reminder_attempts, 0);
});

test("dry run reports what it would do without writing", async () => {
  const rows = new Map([
    [
      "sched-3",
      {
        id: "sched-3",
        status: VACCINATION_STATUS.REMINDER_SENT,
        reminder_sent_at: "2026-07-29T00:00:00.000Z",
        reminder_attempts: 1,
        vaccine_name: "DPT",
        due_date: "2026-07-31",
      },
    ],
  ]);
  const vaccinationRepository = createFakeVaccinationRepo(rows);

  const result = await resetVaccinationReminderClaim({
    vaccinationRepository,
    scheduleId: "sched-3",
    dryRun: true,
  });

  assert.equal(result.outcome, "would_reset");
  assert.equal(vaccinationRepository.resetClaimCalls.length, 0);
  // Untouched — dry run never writes.
  assert.equal(rows.get("sched-3").status, VACCINATION_STATUS.REMINDER_SENT);
});

test("reports not_found for an unknown scheduleId", async () => {
  const vaccinationRepository = createFakeVaccinationRepo(new Map());

  const result = await resetVaccinationReminderClaim({
    vaccinationRepository,
    scheduleId: "missing",
    dryRun: false,
  });

  assert.equal(result.outcome, "not_found");
});

test("reports not_resettable for a schedule that is already pending", async () => {
  const rows = new Map([
    [
      "sched-4",
      {
        id: "sched-4",
        status: VACCINATION_STATUS.PENDING,
        reminder_sent_at: null,
        reminder_attempts: 0,
        vaccine_name: "DPT",
        due_date: "2026-08-05",
      },
    ],
  ]);
  const vaccinationRepository = createFakeVaccinationRepo(rows);

  const result = await resetVaccinationReminderClaim({
    vaccinationRepository,
    scheduleId: "sched-4",
    dryRun: false,
  });

  assert.equal(result.outcome, "not_resettable");
});

test("reports not_resettable for a completed schedule", async () => {
  const rows = new Map([
    [
      "sched-5",
      {
        id: "sched-5",
        status: VACCINATION_STATUS.COMPLETED,
        reminder_sent_at: "2026-07-01T00:00:00.000Z",
        reminder_attempts: 0,
        vaccine_name: "DPT",
        due_date: "2026-07-05",
      },
    ],
  ]);
  const vaccinationRepository = createFakeVaccinationRepo(rows);

  const result = await resetVaccinationReminderClaim({
    vaccinationRepository,
    scheduleId: "sched-5",
    dryRun: false,
  });

  assert.equal(result.outcome, "not_resettable");
});
