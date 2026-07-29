import test from "node:test";
import assert from "node:assert/strict";
import { DailyDigestService } from "../services/daily-digest.service.js";

function createFakeAppointmentRepo(statusCounts) {
  const calls = [];
  return {
    calls,
    async countCreatedBetweenByStatus(fromIso, toIso) {
      calls.push({ fromIso, toIso });
      return statusCounts;
    },
  };
}

function createFakeOpsAlertRepo({ byStep = {}, total = 0 } = {}) {
  const calls = [];
  return {
    calls,
    async countByStepsBetween(steps, fromIso, toIso) {
      calls.push({ steps, fromIso, toIso });
      return steps.reduce((sum, step) => sum + (byStep[step] ?? 0), 0);
    },
    async countBetween(fromIso, toIso) {
      calls.push({ fromIso, toIso });
      return total;
    },
  };
}

test("buildSummary: buckets confirmed+completed as succeeded and cancelled as failed, for yesterday in IST", async () => {
  const appointmentRepo = createFakeAppointmentRepo({ confirmed: 3, completed: 2, cancelled: 1, payment_pending: 4 });
  const opsAlertRepo = createFakeOpsAlertRepo({
    byStep: { vaccination_seed: 2, whatsapp_webhook_message: 1, whatsapp_send: 5 },
    total: 12,
  });
  const service = new DailyDigestService(appointmentRepo, opsAlertRepo);

  // Noon IST on 2026-07-29 -> "yesterday" is 2026-07-28 IST.
  const now = new Date("2026-07-29T06:30:00.000Z");
  const summary = await service.buildSummary(now);

  assert.equal(summary.dateLabel, "2026-07-28");
  assert.equal(summary.bookingsSucceeded, 5);
  assert.equal(summary.bookingsFailed, 1);
  assert.equal(summary.vaccinationSeedFailures, 2);
  assert.equal(summary.webhookErrors, 1);
  assert.equal(summary.whatsappSendFailures, 5);
  assert.equal(summary.totalAlerts, 12);

  // [fromIso, toIso) must be exactly 2026-07-28T00:00 IST -> 2026-07-29T00:00 IST.
  assert.equal(appointmentRepo.calls[0].fromIso, "2026-07-27T18:30:00.000Z");
  assert.equal(appointmentRepo.calls[0].toIso, "2026-07-28T18:30:00.000Z");
});

test("buildSummary: missing status buckets default to zero, not undefined/NaN", async () => {
  const appointmentRepo = createFakeAppointmentRepo({});
  const opsAlertRepo = createFakeOpsAlertRepo();
  const service = new DailyDigestService(appointmentRepo, opsAlertRepo);

  const summary = await service.buildSummary(new Date("2026-07-29T06:30:00.000Z"));

  assert.equal(summary.bookingsSucceeded, 0);
  assert.equal(summary.bookingsFailed, 0);
  assert.equal(summary.vaccinationSeedFailures, 0);
  assert.equal(summary.webhookErrors, 0);
  assert.equal(summary.whatsappSendFailures, 0);
});

test("formatDigestText: includes every summary field in the message body", () => {
  const service = new DailyDigestService(createFakeAppointmentRepo({}), createFakeOpsAlertRepo());
  const text = service.formatDigestText({
    dateLabel: "2026-07-28",
    bookingsSucceeded: 5,
    bookingsFailed: 1,
    vaccinationSeedFailures: 2,
    webhookErrors: 1,
    whatsappSendFailures: 3,
    totalAlerts: 12,
  });

  assert.match(text, /2026-07-28/);
  assert.match(text, /5 succeeded, 1 failed/);
  assert.match(text, /Vaccination seeding\/reminder failures: 2/);
  assert.match(text, /Webhook errors: 1/);
  assert.match(text, /WhatsApp send failures: 3/);
  assert.match(text, /Total ops alerts fired: 12/);
});

test("sendDailyDigest: never throws even when the repositories fail — alerts ops instead", async () => {
  const brokenAppointmentRepo = {
    async countCreatedBetweenByStatus() {
      throw new Error("DB is down");
    },
  };
  const opsAlertRepo = createFakeOpsAlertRepo();
  const service = new DailyDigestService(brokenAppointmentRepo, opsAlertRepo);

  const result = await service.sendDailyDigest(new Date("2026-07-29T06:30:00.000Z"));
  assert.equal(result.summary, null);
  assert.equal(result.delivered, false);
  assert.equal(result.channel, "none");
});

test("sendDailyDigest: returns delivered:false/channel:none with no ops channel configured (logged-only degradation)", async () => {
  const appointmentRepo = createFakeAppointmentRepo({ confirmed: 1 });
  const opsAlertRepo = createFakeOpsAlertRepo();
  const service = new DailyDigestService(appointmentRepo, opsAlertRepo);

  const originalSlack = process.env.OPS_ALERT_SLACK_WEBHOOK_URL;
  const originalWhatsappTo = process.env.OPS_ALERT_WHATSAPP_TO;
  delete process.env.OPS_ALERT_SLACK_WEBHOOK_URL;
  delete process.env.OPS_ALERT_WHATSAPP_TO;

  try {
    const result = await service.sendDailyDigest(new Date("2026-07-29T06:30:00.000Z"));
    assert.equal(result.delivered, false);
    assert.equal(result.channel, "none");
    assert.equal(result.summary.bookingsSucceeded, 1);
  } finally {
    if (originalSlack === undefined) delete process.env.OPS_ALERT_SLACK_WEBHOOK_URL;
    else process.env.OPS_ALERT_SLACK_WEBHOOK_URL = originalSlack;
    if (originalWhatsappTo === undefined) delete process.env.OPS_ALERT_WHATSAPP_TO;
    else process.env.OPS_ALERT_WHATSAPP_TO = originalWhatsappTo;
  }
});
