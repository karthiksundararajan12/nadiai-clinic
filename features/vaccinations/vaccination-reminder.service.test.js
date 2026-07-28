import test from "node:test";
import assert from "node:assert/strict";
import {
  VaccinationReminderService,
  sendVaccinationReminder,
  isTemplateLive,
} from "./vaccination-reminder.service.js";
import { VACCINATION_STATUS, VACCINATION_REMINDER_TEMPLATE_NAME } from "./constants.js";
import { BookingError } from "../booking/errors.js";

const CLINIC = {
  id: "clinic-1",
  name: "Nadi Clinic",
  whatsapp_phone_number_id: "phone-number-1",
};

const PATIENT = {
  id: "patient-1",
  full_name: "Asha Kumar",
  contact_phone: "919876543210",
};

// Both gates on — used by tests that need an actual (fake) send to happen.
const BOTH_LIVE = { templatesLive: true, vaccinationReminderTemplateLive: true };

function schedule(overrides = {}) {
  return {
    id: "sched-1",
    clinic_id: CLINIC.id,
    patient_id: PATIENT.id,
    vaccine_name: "MMR (2nd dose)",
    due_date: "2026-08-01",
    status: VACCINATION_STATUS.PENDING,
    reminder_sent_at: null,
    completed_at: null,
    created_at: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

function createFakeVaccinationRepo({ due = [], findByIdResult, claimResult } = {}) {
  /** @type {Map<string, object>} */
  const rows = new Map(due.map((row) => [row.id, { ...row }]));
  const calls = {
    findDueForReminder: [],
    claimReminderSent: [],
    revertToPending: [],
    markOverdue: [],
    findById: [],
  };

  return {
    calls,
    rows,
    async findDueForReminder(cutoffDate) {
      calls.findDueForReminder.push(cutoffDate);
      return [...rows.values()].filter(
        (r) => r.status === VACCINATION_STATUS.PENDING && r.due_date <= cutoffDate,
      );
    },
    async claimReminderSent(scheduleId) {
      calls.claimReminderSent.push(scheduleId);
      if (claimResult !== undefined) return claimResult;
      const row = rows.get(scheduleId);
      if (!row || row.status !== VACCINATION_STATUS.PENDING) return null;
      row.status = VACCINATION_STATUS.REMINDER_SENT;
      row.reminder_sent_at = new Date().toISOString();
      return { ...row };
    },
    async revertToPending(scheduleId) {
      calls.revertToPending.push(scheduleId);
      const row = rows.get(scheduleId);
      if (!row || row.status !== VACCINATION_STATUS.REMINDER_SENT) return null;
      row.status = VACCINATION_STATUS.PENDING;
      row.reminder_sent_at = null;
      return { ...row };
    },
    async markOverdue(todayDate) {
      calls.markOverdue.push(todayDate);
      const overdue = [];
      for (const row of rows.values()) {
        if (row.status === VACCINATION_STATUS.REMINDER_SENT && row.due_date < todayDate) {
          row.status = VACCINATION_STATUS.OVERDUE;
          overdue.push({ id: row.id });
        }
      }
      return overdue;
    },
    async findById(scheduleId) {
      calls.findById.push(scheduleId);
      if (findByIdResult !== undefined) return findByIdResult;
      const row = rows.get(scheduleId);
      return row ? { ...row } : null;
    },
  };
}

function createFakeClinicRepo(clinic = CLINIC) {
  return { async findById() { return clinic; } };
}

function createFakePatientRepo(patient = PATIENT) {
  return { async findById() { return patient; } };
}

function createFakeWhatsAppClient({ sendTemplate } = {}) {
  const sendTemplateCalls = [];
  return {
    sendTemplateCalls,
    async sendTemplate(phoneNumberId, toPhone, opts) {
      sendTemplateCalls.push({ phoneNumberId, toPhone, opts });
      if (sendTemplate) return sendTemplate(phoneNumberId, toPhone, opts);
      return { ok: true };
    },
  };
}

test("isTemplateLive requires both the global and template-specific flags", () => {
  assert.equal(
    isTemplateLive(VACCINATION_REMINDER_TEMPLATE_NAME, { globalLive: false, templateLive: false }),
    false,
  );
  assert.equal(
    isTemplateLive(VACCINATION_REMINDER_TEMPLATE_NAME, { globalLive: true, templateLive: false }),
    false,
  );
  assert.equal(
    isTemplateLive(VACCINATION_REMINDER_TEMPLATE_NAME, { globalLive: false, templateLive: true }),
    false,
  );
  assert.equal(
    isTemplateLive(VACCINATION_REMINDER_TEMPLATE_NAME, { globalLive: true, templateLive: true }),
    true,
  );
});

test("isTemplateLive falls back to the global flag alone for templates with no registered per-template gate", () => {
  assert.equal(isTemplateLive("some_other_already_approved_template", { globalLive: true }), true);
  assert.equal(isTemplateLive("some_other_already_approved_template", { globalLive: false }), false);
});

test("sendVaccinationReminder skips with TEMPLATE_NOT_LIVE when WHATSAPP_TEMPLATES_LIVE is false", async () => {
  const wa = createFakeWhatsAppClient();

  const result = await sendVaccinationReminder("phone-1", "919876543210", {
    whatsappClient: wa,
    bodyParams: ["Asha", "MMR", "1 Aug 2026"],
    templatesLive: false,
    vaccinationReminderTemplateLive: true,
  });

  assert.deepEqual(result, {
    stubbed: true,
    templateName: VACCINATION_REMINDER_TEMPLATE_NAME,
    skippedReason: "TEMPLATE_NOT_LIVE",
  });
  assert.equal(wa.sendTemplateCalls.length, 0);
});

test("sendVaccinationReminder skips with TEMPLATE_NOT_LIVE when the global flag is on but the template-specific flag is off", async () => {
  const wa = createFakeWhatsAppClient();

  const result = await sendVaccinationReminder("phone-1", "919876543210", {
    whatsappClient: wa,
    bodyParams: ["Asha", "MMR", "1 Aug 2026"],
    templatesLive: true,
    vaccinationReminderTemplateLive: false,
  });

  assert.deepEqual(result, {
    stubbed: true,
    templateName: VACCINATION_REMINDER_TEMPLATE_NAME,
    skippedReason: "TEMPLATE_NOT_LIVE",
  });
  assert.equal(wa.sendTemplateCalls.length, 0);
});

test("sendVaccinationReminder calls the WhatsApp client when both templatesLive and vaccinationReminderTemplateLive are true", async () => {
  const wa = createFakeWhatsAppClient();

  const result = await sendVaccinationReminder("phone-1", "919876543210", {
    whatsappClient: wa,
    bodyParams: ["Asha", "MMR", "1 Aug 2026"],
    templatesLive: true,
    vaccinationReminderTemplateLive: true,
  });

  assert.equal(result.templateSent, true);
  assert.equal(wa.sendTemplateCalls.length, 1);
  assert.equal(wa.sendTemplateCalls[0].opts.templateName, VACCINATION_REMINDER_TEMPLATE_NAME);
});

test("runReminderSweep sends a reminder for a schedule due within the lead window and transitions it to reminder_sent", async () => {
  const dueSoon = schedule({ id: "due-soon", due_date: "2026-07-18" });
  const vaccinationRepo = createFakeVaccinationRepo({ due: [dueSoon] });
  const wa = createFakeWhatsAppClient();
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo(),
    createFakePatientRepo(),
    wa,
    BOTH_LIVE,
  );

  const summary = await service.runReminderSweep(new Date("2026-07-16T00:00:00.000Z"));

  assert.equal(summary.scanned, 1);
  assert.equal(summary.remindersSent, 1);
  assert.equal(summary.remindersFailed, 0);
  assert.equal(summary.remindersSkippedTemplateNotLive, 0);
  assert.equal(vaccinationRepo.rows.get("due-soon").status, VACCINATION_STATUS.REMINDER_SENT);
  assert.equal(wa.sendTemplateCalls.length, 1);
  assert.equal(wa.sendTemplateCalls[0].toPhone, PATIENT.contact_phone);
});

test("runReminderSweep does not touch schedules outside the lead window", async () => {
  const farOut = schedule({ id: "far-out", due_date: "2026-09-01" });
  const vaccinationRepo = createFakeVaccinationRepo({ due: [farOut] });
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo(),
    createFakePatientRepo(),
    createFakeWhatsAppClient(),
    { templatesLive: false, vaccinationReminderTemplateLive: false },
  );

  const summary = await service.runReminderSweep(new Date("2026-07-16T00:00:00.000Z"));

  assert.equal(summary.scanned, 0);
  assert.equal(summary.remindersSent, 0);
  assert.equal(vaccinationRepo.rows.get("far-out").status, VACCINATION_STATUS.PENDING);
});

test("runReminderSweep sweeps overdue reminder_sent schedules to overdue", async () => {
  const overdueRow = schedule({
    id: "overdue-1",
    status: VACCINATION_STATUS.REMINDER_SENT,
    due_date: "2026-07-01",
  });
  const notYetOverdue = schedule({
    id: "not-overdue",
    status: VACCINATION_STATUS.REMINDER_SENT,
    due_date: "2026-07-20",
  });
  const vaccinationRepo = createFakeVaccinationRepo({ due: [overdueRow, notYetOverdue] });
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo(),
    createFakePatientRepo(),
    createFakeWhatsAppClient(),
    { templatesLive: false, vaccinationReminderTemplateLive: false },
  );

  const summary = await service.runReminderSweep(new Date("2026-07-16T00:00:00.000Z"));

  assert.equal(summary.markedOverdue, 1);
  assert.equal(vaccinationRepo.rows.get("overdue-1").status, VACCINATION_STATUS.OVERDUE);
  assert.equal(vaccinationRepo.rows.get("not-overdue").status, VACCINATION_STATUS.REMINDER_SENT);
});

test("runReminderSweep never re-sends a schedule that is already reminder_sent (dedup)", async () => {
  const alreadySent = schedule({
    id: "already-sent",
    status: VACCINATION_STATUS.REMINDER_SENT,
    due_date: "2026-07-18",
  });
  const vaccinationRepo = createFakeVaccinationRepo({ due: [alreadySent] });
  const wa = createFakeWhatsAppClient();
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo(),
    createFakePatientRepo(),
    wa,
    BOTH_LIVE,
  );

  const summary = await service.runReminderSweep(new Date("2026-07-16T00:00:00.000Z"));

  // findDueForReminder only ever returns `pending` rows, so an already-sent
  // row is never even a candidate — the dedup guard is defense in depth.
  assert.equal(summary.scanned, 0);
  assert.equal(wa.sendTemplateCalls.length, 0);
});

test("runReminderSweep skips due schedules with TEMPLATE_NOT_LIVE and leaves them pending when only the global flag is on", async () => {
  const dueSoon = schedule({ id: "due-soon", due_date: "2026-07-18" });
  const vaccinationRepo = createFakeVaccinationRepo({ due: [dueSoon] });
  const wa = createFakeWhatsAppClient();
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo(),
    createFakePatientRepo(),
    wa,
    { templatesLive: true, vaccinationReminderTemplateLive: false },
  );

  const summary = await service.runReminderSweep(new Date("2026-07-16T00:00:00.000Z"));

  assert.equal(summary.scanned, 1);
  assert.equal(summary.remindersSent, 0);
  assert.equal(summary.remindersFailed, 0);
  assert.equal(summary.remindersSkippedTemplateNotLive, 1);
  // Not claimed — stays pending so it's retried once the template goes live.
  assert.equal(vaccinationRepo.rows.get("due-soon").status, VACCINATION_STATUS.PENDING);
  assert.equal(vaccinationRepo.calls.claimReminderSent.length, 0);
  assert.equal(wa.sendTemplateCalls.length, 0);
});

test("runReminderSweep rolls a schedule back to pending (not reminder_sent) when the WhatsApp send throws after being claimed", async () => {
  const dueSoon = schedule({ id: "due-soon", due_date: "2026-07-18" });
  const vaccinationRepo = createFakeVaccinationRepo({ due: [dueSoon] });
  const wa = createFakeWhatsAppClient({
    sendTemplate: async () => {
      throw new Error("Meta error 132001: template not found");
    },
  });
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo(),
    createFakePatientRepo(),
    wa,
    BOTH_LIVE,
  );

  const summary = await service.runReminderSweep(new Date("2026-07-16T00:00:00.000Z"));

  assert.equal(summary.remindersSent, 0);
  assert.equal(summary.remindersFailed, 1);
  assert.equal(summary.remindersSkippedTemplateNotLive, 0);
  // Claimed (reminder_sent) then rolled back to pending — never left stuck
  // as "sent" despite the send actually failing.
  assert.equal(vaccinationRepo.calls.claimReminderSent.length, 1);
  assert.equal(vaccinationRepo.calls.revertToPending.length, 1);
  const row = vaccinationRepo.rows.get("due-soon");
  assert.equal(row.status, VACCINATION_STATUS.PENDING);
  assert.equal(row.reminder_sent_at, null);
});

test("sendReminderNow force-sends a pending schedule regardless of due_date", async () => {
  const farOut = schedule({ id: "force-1", due_date: "2027-01-01" });
  const vaccinationRepo = createFakeVaccinationRepo({ due: [farOut] });
  const wa = createFakeWhatsAppClient();
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo(),
    createFakePatientRepo(),
    wa,
    BOTH_LIVE,
  );

  const result = await service.sendReminderNow({ scheduleId: "force-1" });

  assert.equal(result.sent, true);
  assert.equal(result.skippedReason, null);
  assert.equal(vaccinationRepo.rows.get("force-1").status, VACCINATION_STATUS.REMINDER_SENT);
  assert.equal(wa.sendTemplateCalls.length, 1);
});

test("sendReminderNow returns TEMPLATE_NOT_LIVE (not CLAIM_OR_SEND_FAILED) and leaves the schedule pending when the template-specific flag is off", async () => {
  const farOut = schedule({ id: "force-1", due_date: "2027-01-01" });
  const vaccinationRepo = createFakeVaccinationRepo({ due: [farOut] });
  const wa = createFakeWhatsAppClient();
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo(),
    createFakePatientRepo(),
    wa,
    { templatesLive: true, vaccinationReminderTemplateLive: false },
  );

  const result = await service.sendReminderNow({ scheduleId: "force-1" });

  assert.equal(result.sent, false);
  assert.equal(result.skippedReason, "TEMPLATE_NOT_LIVE");
  assert.equal(vaccinationRepo.rows.get("force-1").status, VACCINATION_STATUS.PENDING);
  assert.equal(wa.sendTemplateCalls.length, 0);
});

test("sendReminderNow skips a schedule that is not pending", async () => {
  const completed = schedule({ id: "done-1", status: VACCINATION_STATUS.COMPLETED });
  const vaccinationRepo = createFakeVaccinationRepo({ due: [completed] });
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo(),
    createFakePatientRepo(),
    createFakeWhatsAppClient(),
    BOTH_LIVE,
  );

  const result = await service.sendReminderNow({ scheduleId: "done-1" });

  assert.equal(result.sent, false);
  assert.equal(result.skippedReason, "NOT_PENDING");
});

test("sendReminderNow rejects a missing scheduleId", async () => {
  const vaccinationRepo = createFakeVaccinationRepo();
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo(),
    createFakePatientRepo(),
    createFakeWhatsAppClient(),
    { templatesLive: false, vaccinationReminderTemplateLive: false },
  );

  await assert.rejects(
    () => service.sendReminderNow({ scheduleId: "" }),
    (error) => error instanceof BookingError && error.code === "MISSING_SCHEDULE_ID",
  );
});

test("sendReminderNow throws 404 for an unknown schedule", async () => {
  const vaccinationRepo = createFakeVaccinationRepo({ findByIdResult: null });
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo(),
    createFakePatientRepo(),
    createFakeWhatsAppClient(),
    { templatesLive: false, vaccinationReminderTemplateLive: false },
  );

  await assert.rejects(
    () => service.sendReminderNow({ scheduleId: "missing" }),
    (error) => error instanceof BookingError && error.statusCode === 404,
  );
});

test("sendReminderNow throws when the clinic has no WhatsApp phone number configured", async () => {
  const pending = schedule({ id: "no-wa" });
  const vaccinationRepo = createFakeVaccinationRepo({ due: [pending] });
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo({ ...CLINIC, whatsapp_phone_number_id: null }),
    createFakePatientRepo(),
    createFakeWhatsAppClient(),
    BOTH_LIVE,
  );

  await assert.rejects(
    () => service.sendReminderNow({ scheduleId: "no-wa" }),
    (error) => error instanceof BookingError && error.code === "CLINIC_WHATSAPP_NOT_CONFIGURED",
  );
  // Claiming never happens before the clinic check, so the row stays pending.
  assert.equal(vaccinationRepo.rows.get("no-wa").status, VACCINATION_STATUS.PENDING);
});

test("an overlapping claim attempt on the same schedule only sends once", async () => {
  const dueSoon = schedule({ id: "race-1", due_date: "2026-07-18" });
  const vaccinationRepo = createFakeVaccinationRepo({ due: [dueSoon] });
  const wa = createFakeWhatsAppClient();
  const service = new VaccinationReminderService(
    vaccinationRepo,
    createFakeClinicRepo(),
    createFakePatientRepo(),
    wa,
    BOTH_LIVE,
  );

  const [first, second] = await Promise.all([
    service._claimAndSend(dueSoon),
    service._claimAndSend(dueSoon),
  ]);

  const sentCount = [first, second].filter((r) => r.sent).length;
  assert.equal(sentCount, 1);
  assert.equal(wa.sendTemplateCalls.length, 1);
});
