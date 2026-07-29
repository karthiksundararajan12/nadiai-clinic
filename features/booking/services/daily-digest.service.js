/**
 * @fileoverview DailyDigestService — scheduled morning summary sent to the
 * same ops alert channel as every other alertOps() call (Slack webhook or
 * admin WhatsApp number — see lib/alerting.js).
 *
 * Driven by the cron route GET /api/cron/daily-digest (same CRON_SECRET
 * worker-auth pattern as /api/cron/booking-reminders and
 * /api/cron/vaccination-reminders — see those files), scheduled once daily
 * shortly after midnight IST via GitHub Actions
 * (.github/workflows/daily-digest.yml), mirroring the existing reminder
 * crons' infra rather than introducing a new scheduler.
 *
 * Reports on the PREVIOUS calendar day in IST (fixed UTC+05:30, no DST —
 * same assumption as lib/slot-engine.js's SLOT_TIMEZONE_OFFSET, since no
 * per-clinic timezone column exists yet):
 *   - Appointments created yesterday, bucketed succeeded (confirmed/
 *     completed) vs failed (cancelled — hold expiry, payment failure,
 *     patient/doctor cancellation all land here; this is a coarse signal,
 *     not a root-cause breakdown) via AppointmentRepository
 *     .countCreatedBetweenByStatus (platform-wide, not clinic-scoped — see
 *     that method's own header note).
 *   - Vaccination auto-seed / reminder failures, webhook errors, and
 *     WhatsApp send failures yesterday, all read from public.ops_alerts
 *     (migration 032) via OpsAlertRepository — i.e. every alertOps() call
 *     from the rest of this session's changes feeds this digest.
 */

import { createLogger } from "../logger.js";
import {
  sendToOpsChannel,
  alertOps,
  VACCINATION_SEED_FAILURE_STEPS,
  WEBHOOK_ERROR_STEPS,
  WHATSAPP_SEND_FAILURE_STEPS,
} from "../lib/alerting.js";
import { APPOINTMENT_STATUS } from "../constants.js";

const DAILY_DIGEST_STEP = "daily_digest";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {Date} now
 * @returns {{ fromIso: string; toIso: string; dateLabel: string }} the
 *   [fromIso, toIso) window covering yesterday in IST, plus a human label.
 */
function yesterdayIstRange(now) {
  const istNowMs = now.getTime() + IST_OFFSET_MS;
  const istMidnightTodayMs = Math.floor(istNowMs / DAY_MS) * DAY_MS;
  const istMidnightYesterdayMs = istMidnightTodayMs - DAY_MS;

  const fromIso = new Date(istMidnightYesterdayMs - IST_OFFSET_MS).toISOString();
  const toIso = new Date(istMidnightTodayMs - IST_OFFSET_MS).toISOString();
  const dateLabel = new Date(istMidnightYesterdayMs).toISOString().slice(0, 10);

  return { fromIso, toIso, dateLabel };
}

export class DailyDigestService {
  /**
   * @param {import("../repository/appointment.repository.js").AppointmentRepository} appointmentRepository
   * @param {import("../repository/ops-alert.repository.js").OpsAlertRepository} opsAlertRepository
   */
  constructor(appointmentRepository, opsAlertRepository) {
    this._appointments = appointmentRepository;
    this._opsAlerts = opsAlertRepository;
    this._log = createLogger({ component: "DailyDigestService" });
  }

  /**
   * @param {Date} [now]
   * @returns {Promise<{
   *   dateLabel: string;
   *   bookingsSucceeded: number;
   *   bookingsFailed: number;
   *   vaccinationSeedFailures: number;
   *   webhookErrors: number;
   *   whatsappSendFailures: number;
   *   totalAlerts: number;
   *   statusCounts: Record<string, number>;
   * }>}
   */
  async buildSummary(now = new Date()) {
    const { fromIso, toIso, dateLabel } = yesterdayIstRange(now);

    const [statusCounts, vaccinationSeedFailures, webhookErrors, whatsappSendFailures, totalAlerts] =
      await Promise.all([
        this._appointments.countCreatedBetweenByStatus(fromIso, toIso),
        this._opsAlerts.countByStepsBetween(VACCINATION_SEED_FAILURE_STEPS, fromIso, toIso),
        this._opsAlerts.countByStepsBetween(WEBHOOK_ERROR_STEPS, fromIso, toIso),
        this._opsAlerts.countByStepsBetween(WHATSAPP_SEND_FAILURE_STEPS, fromIso, toIso),
        this._opsAlerts.countBetween(fromIso, toIso),
      ]);

    const bookingsSucceeded =
      (statusCounts[APPOINTMENT_STATUS.CONFIRMED] ?? 0) + (statusCounts[APPOINTMENT_STATUS.COMPLETED] ?? 0);
    const bookingsFailed = statusCounts[APPOINTMENT_STATUS.CANCELLED] ?? 0;

    return {
      dateLabel,
      bookingsSucceeded,
      bookingsFailed,
      vaccinationSeedFailures,
      webhookErrors,
      whatsappSendFailures,
      totalAlerts,
      statusCounts,
    };
  }

  /** @param {Awaited<ReturnType<DailyDigestService["buildSummary"]>>} summary */
  formatDigestText(summary) {
    const lines = [
      `\u{1F4CA} Nadi AI daily digest — ${summary.dateLabel} (IST)`,
      `Bookings: ${summary.bookingsSucceeded} succeeded, ${summary.bookingsFailed} failed/cancelled`,
      `Vaccination seeding/reminder failures: ${summary.vaccinationSeedFailures}`,
      `Webhook errors: ${summary.webhookErrors}`,
      `WhatsApp send failures: ${summary.whatsappSendFailures}`,
      `Total ops alerts fired: ${summary.totalAlerts}`,
    ];
    return lines.join("\n");
  }

  /**
   * Builds and sends the digest to the configured ops channel. Never
   * throws — same rationale as alertOps: a broken alert channel must not
   * turn a routine cron tick into an incident.
   *
   * @param {Date} [now]
   * @returns {Promise<{ summary: object; delivered: boolean; channel: string }>}
   */
  async sendDailyDigest(now = new Date()) {
    try {
      const summary = await this.buildSummary(now);
      const text = this.formatDigestText(summary);
      const { sent: delivered, channel } = await sendToOpsChannel(text);

      this._log.info("Daily digest built", { ...summary, delivered, channel });
      return { summary, delivered, channel };
    } catch (err) {
      this._log.error("Failed to build/send daily digest", {
        error: err instanceof Error ? err.message : String(err),
      });
      await alertOps({
        title: "Nadi AI daily digest failed to run",
        step: DAILY_DIGEST_STEP,
        error: err,
      });
      return { summary: null, delivered: false, channel: "none" };
    }
  }
}
