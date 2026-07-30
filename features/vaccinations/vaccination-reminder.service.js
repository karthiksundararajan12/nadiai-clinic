/**
 * @fileoverview VaccinationReminderService — daily cron sweep (see
 * app/api/cron/vaccination-reminders/route.js):
 *
 *   1. runReminderSweep(): finds `vaccination_schedules` rows due within
 *      VACCINATION_REMINDER_LEAD_DAYS that are still `pending` and, if the
 *      `vaccination_reminder` template is live (see isTemplateLive below),
 *      atomically claims + sends a WhatsApp reminder. On success: status ->
 *      reminder_sent, reminder_sent_at = now(). Also sweeps `reminder_sent`
 *      rows whose due_date has passed to `overdue`.
 *
 *   2. sendReminderNow(): on-demand/test force-send for one schedule,
 *      bypassing the lead-time window — mirrors
 *      ReminderService.sendReminderNow, used by the cron route's
 *      ?scheduleId= test mode.
 *
 * No per-clinic loop is needed (unlike ReminderService's appointment
 * reminders, which loop clinics for their own configured offset columns):
 * the 3-day lead time is a fixed constant, not per-clinic config, so one
 * global query covers every clinic — see
 * VaccinationRepository.findDueForReminder.
 *
 * Every mutation goes through VaccinationRepository's atomic
 * conditional-UPDATE methods (claimReminderSent, markOverdue,
 * recordReminderFailure) — never read-then-write — so an overlapping cron
 * tick or a redelivered force-send can't double-send a reminder (dedup on
 * reminder_sent).
 *
 * ── Claim/retry on send failure (post-incident fix) ─────────────────────
 *
 * claimReminderSent flips a schedule to `reminder_sent` BEFORE the
 * WhatsApp send is confirmed, so the send is only ever attempted against
 * a row this run exclusively owns. If that send then throws, the claim
 * must not be left dangling — that would permanently skip a reminder that
 * was never actually delivered. _claimAndSend's catch block calls
 * recordReminderFailure, which releases the claim back to `pending` for a
 * retry on the next sweep, UNLESS this was the
 * MAX_VACCINATION_REMINDER_ATTEMPTS-th consecutive failure, in which case
 * the schedule is moved to the terminal `reminder_failed` status instead
 * so a permanently-broken send (bad template, dead number) doesn't retry
 * — and re-alert — forever. See VaccinationRepository.recordReminderFailure
 * and constants.js for the attempt cap. A one-off admin recovery path for
 * a stuck record lives at scripts/reset-vaccination-reminder-claim.mjs
 * (VaccinationRepository.resetClaim).
 *
 * ── Two-gate template approval (post-incident fix) ─────────────────────
 *
 * `WHATSAPP_TEMPLATES_LIVE` is a single *global* flag shared by every
 * template in the booking feature. Once it was flipped on for already
 * -approved templates (`appt_booking_confirmed`, `appt_invoice`,
 * `appt_reminder_24h`/`appt_reminder_2h`), `sendVaccinationReminder` started
 * inheriting that same flag and began attempting *real* sends for
 * `vaccination_reminder` — a template that was never submitted/approved —
 * which Meta rejected with error 132001 ("template not found").
 *
 * The fix is a second, template-specific gate: a schedule only sends for
 * real when BOTH `WHATSAPP_TEMPLATES_LIVE` (global) AND
 * `WHATSAPP_VACCINATION_REMINDER_TEMPLATE_LIVE` (this template only) are
 * `"true"` — see `isTemplateLive`. Critically, this check happens *before*
 * `claimReminderSent`: if the template isn't live, the schedule is left
 * untouched (still `pending`) rather than being claimed as if it had been
 * sent, so it's naturally picked up again once
 * `WHATSAPP_VACCINATION_REMINDER_TEMPLATE_LIVE` is flipped on. Do not set
 * that env var until `vaccination_reminder` is confirmed APPROVED in Meta
 * Business Manager.
 */

import {
  VACCINATION_STATUS,
  VACCINATION_REMINDER_LEAD_DAYS,
  VACCINATION_REMINDER_TEMPLATE_NAME,
  VACCINATION_REMINDER_TEMPLATE_LANGUAGE_CODE,
  MAX_VACCINATION_REMINDER_ATTEMPTS,
} from "./constants.js";
import { BookingError } from "../booking/errors.js";
import { createLogger } from "../booking/logger.js";
import { alertOps, OPS_ALERT_STEP } from "../booking/lib/alerting.js";

/** @param {Date} date @returns {string} YYYY-MM-DD in Asia/Kolkata */
function istDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const DUE_DATE_MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * `due_date` comes back from Supabase as a plain `date` column, i.e. a
 * date-only string like "2026-08-01" with no time or timezone component.
 * We must NOT round-trip that through `new Date(...)` + locale formatting:
 * `new Date` treats a bare "YYYY-MM-DD" (or one with an explicit offset) as
 * a specific instant, and `toLocaleDateString`/`Intl` without an explicit
 * `timeZone` then renders that instant in the *server's* local timezone.
 * Vercel functions run in UTC, so an IST calendar date constructed that way
 * gets rendered a day early (e.g. "2026-08-01" -> "31 Jul 2026") — the
 * conversion direction depends entirely on server TZ, which is exactly what
 * we must not depend on. Instead, parse the string directly and build the
 * label from its digits — no Date object, no timezone involved at all.
 *
 * @param {string} dueDate YYYY-MM-DD
 * @returns {string} e.g. "3 Aug 2026"
 */
export function formatDueDateLabel(dueDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dueDate ?? ""));
  if (!match) return dueDate;
  const [, year, month, day] = match;
  const monthLabel = DUE_DATE_MONTH_LABELS[Number(month) - 1];
  if (!monthLabel) return dueDate;
  return `${Number(day)} ${monthLabel} ${year}`;
}

/**
 * Registry of templates that require a *second*, template-specific env var
 * on top of the global `WHATSAPP_TEMPLATES_LIVE` flag before they're
 * allowed to send for real (see isTemplateLive). Templates NOT listed here
 * fall back to the global flag alone — i.e. the pre-existing behavior for
 * already-approved templates (`appt_booking_confirmed`, `appt_invoice`,
 * `appt_reminder_24h`/`appt_reminder_2h`), which this fix does not touch.
 *
 * Register any future not-yet-approved template here so it's safe-by
 * -default (cannot start sending for real just because the global flag
 * happens to already be on for other, unrelated, approved templates) —
 * exactly the gap that caused the Meta 132001 failure this fixes.
 */
export const TEMPLATE_SPECIFIC_LIVE_ENV_VAR = Object.freeze({
  [VACCINATION_REMINDER_TEMPLATE_NAME]: "WHATSAPP_VACCINATION_REMINDER_TEMPLATE_LIVE",
});

/**
 * Two-gate "is this template allowed to send for real right now" check.
 * Reusable for any template registered in TEMPLATE_SPECIFIC_LIVE_ENV_VAR —
 * not vaccination-reminder-specific.
 *
 * @param {string} templateName
 * @param {{ globalLive?: boolean; templateLive?: boolean }} [overrides]
 *   Test-only overrides; when omitted, reads from process.env.
 * @returns {boolean}
 */
export function isTemplateLive(templateName, { globalLive, templateLive } = {}) {
  const globalFlag = globalLive ?? (process.env.WHATSAPP_TEMPLATES_LIVE === "true");
  if (!globalFlag) return false;

  const envVarName = TEMPLATE_SPECIFIC_LIVE_ENV_VAR[templateName];
  if (!envVarName) return true;

  return templateLive ?? (process.env[envVarName] === "true");
}

/**
 * Sends (or, until both gates are live, logs) one vaccination reminder.
 * Guarded by isTemplateLive — do not set WHATSAPP_VACCINATION_REMINDER_TEMPLATE_LIVE
 * until `vaccination_reminder` is confirmed APPROVED in Meta Business
 * Manager, or a real send will be rejected by the Graph API (error 132001).
 *
 * @param {string} phoneNumberId Clinic's Meta phone_number_id
 * @param {string} patientPhone WhatsApp `to` (digits, no +)
 * @param {{
 *   whatsappClient?: import("../booking/services/whatsapp-client.service.js").WhatsAppClientService;
 *   bodyParams: string[];
 *     Must have exactly 4 elements, matching the 4 placeholders in
 *     VACCINATION_REMINDER_TEMPLATE_BODY (constants.js): [patientName,
 *     patientName again (template appends the possessive "'s" itself),
 *     vaccineName, formatted due date]. Sending 3 (a past bug — see
 *     constants.js's param-count-fix note) is rejected by the Graph API
 *     with error 132000 ("number of localizable_params does not match").
 *   templatesLive?: boolean;
 *   vaccinationReminderTemplateLive?: boolean;
 * }} opts
 * @returns {Promise<{ stubbed?: true; templateName: string; templateSent?: boolean; skippedReason?: string }>}
 */
export async function sendVaccinationReminder(phoneNumberId, patientPhone, opts) {
  const {
    whatsappClient,
    bodyParams,
    templatesLive,
    vaccinationReminderTemplateLive,
  } = opts ?? {};

  const live = isTemplateLive(VACCINATION_REMINDER_TEMPLATE_NAME, {
    globalLive: templatesLive,
    templateLive: vaccinationReminderTemplateLive,
  });

  if (!live) {
    createLogger({ component: "sendVaccinationReminder" }).info(
      "vaccination_reminder is not live (WHATSAPP_TEMPLATES_LIVE and/or WHATSAPP_VACCINATION_REMINDER_TEMPLATE_LIVE is not true) — skipping WhatsApp send (template pending Meta approval)",
      {
        phoneNumberId,
        patientPhone,
        templateName: VACCINATION_REMINDER_TEMPLATE_NAME,
        bodyParams,
      },
    );
    return {
      stubbed: true,
      templateName: VACCINATION_REMINDER_TEMPLATE_NAME,
      skippedReason: "TEMPLATE_NOT_LIVE",
    };
  }

  if (!whatsappClient) {
    throw new Error("sendVaccinationReminder requires whatsappClient when both live gates are true");
  }
  if (!patientPhone) {
    throw new Error("sendVaccinationReminder requires a patient contact_phone");
  }

  await whatsappClient.sendTemplate(phoneNumberId, patientPhone, {
    templateName: VACCINATION_REMINDER_TEMPLATE_NAME,
    languageCode: VACCINATION_REMINDER_TEMPLATE_LANGUAGE_CODE,
    bodyParams,
  });

  return { templateName: VACCINATION_REMINDER_TEMPLATE_NAME, templateSent: true };
}

export class VaccinationReminderService {
  /**
   * @param {import("./vaccination.repository.js").VaccinationRepository} vaccinationRepository
   * @param {import("../booking/repository/clinic.repository.js").ClinicRepository} clinicRepository
   * @param {import("../booking/repository/patient.repository.js").PatientRepository} patientRepository
   * @param {import("../booking/services/whatsapp-client.service.js").WhatsAppClientService} whatsappClient
   * @param {{ templatesLive?: boolean; vaccinationReminderTemplateLive?: boolean }} [opts]
   */
  constructor(vaccinationRepository, clinicRepository, patientRepository, whatsappClient, {
    templatesLive = false,
    vaccinationReminderTemplateLive = false,
  } = {}) {
    this._vaccinations = vaccinationRepository;
    this._clinicRepo = clinicRepository;
    this._patientRepo = patientRepository;
    this._wa = whatsappClient;
    this._templatesLive = templatesLive;
    this._vaccinationReminderTemplateLive = vaccinationReminderTemplateLive;
    this._log = createLogger({ component: "VaccinationReminderService" });
  }

  /**
   * @param {Date} [now]
   * @returns {Promise<{
   *   scanned: number;
   *   remindersSent: number;
   *   remindersFailed: number;
   *   remindersSkippedTemplateNotLive: number;
   *   remindersExhausted: number;
   *   markedOverdue: number;
   * }>}
   */
  async runReminderSweep(now = new Date()) {
    const cutoffDate = istDateKey(
      new Date(now.getTime() + VACCINATION_REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000),
    );
    const todayDate = istDateKey(now);

    const due = await this._vaccinations.findDueForReminder(cutoffDate);
    const results = await Promise.all(due.map((schedule) => this._claimAndSend(schedule)));
    const remindersSent = results.filter((r) => r.sent).length;
    const remindersSkippedTemplateNotLive = results.filter(
      (r) => r.skippedReason === "TEMPLATE_NOT_LIVE",
    ).length;
    // Permanently given-up schedules (moved to `reminder_failed`) are a
    // subset of "failed" but broken out separately so the digest can
    // distinguish "will retry tomorrow" from "needs a human now".
    const remindersExhausted = results.filter(
      (r) => r.skippedReason === "MAX_ATTEMPTS_EXCEEDED",
    ).length;
    const remindersFailed = results.length - remindersSent - remindersSkippedTemplateNotLive;

    let markedOverdue = 0;
    try {
      const overdueRows = await this._vaccinations.markOverdue(todayDate);
      markedOverdue = overdueRows.length;
    } catch (err) {
      this._log.error("Failed to sweep overdue vaccination schedules", {
        error: err instanceof Error ? err.message : String(err),
      });
      await alertOps({
        title: "Failed to sweep overdue vaccination schedules",
        step: OPS_ALERT_STEP.VACCINATION_OVERDUE_SWEEP,
        error: err,
      });
    }

    const summary = {
      scanned: due.length,
      remindersSent,
      remindersFailed,
      remindersSkippedTemplateNotLive,
      remindersExhausted,
      markedOverdue,
    };
    this._log.info("Vaccination reminder sweep finished", summary);
    return summary;
  }

  /**
   * On-demand / test trigger: claims + sends one reminder regardless of
   * due_date, bypassing the lead-time window. Still uses the same
   * pre-claim template-live gate and atomic claimReminderSent path
   * (at-most-once) as the cron sweep — so force-sending before
   * `vaccination_reminder` is actually live safely no-ops instead of
   * hitting Meta with an unapproved template name.
   *
   * Intended for protected admin/cron callers (CRON_SECRET) only — never
   * expose without auth. Mirrors ReminderService.sendReminderNow.
   *
   * @param {{ scheduleId: string }} params
   * @returns {Promise<{ sent: boolean; skippedReason: string|null; scheduleId: string; status?: string }>}
   */
  async sendReminderNow({ scheduleId }) {
    if (!scheduleId) {
      throw new BookingError("scheduleId is required", "MISSING_SCHEDULE_ID", 400);
    }

    const schedule = await this._vaccinations.findById(scheduleId);
    if (!schedule) {
      throw new BookingError(
        `Vaccination schedule ${scheduleId} not found`,
        "SCHEDULE_NOT_FOUND",
        404,
        { scheduleId },
      );
    }

    if (schedule.status !== VACCINATION_STATUS.PENDING) {
      this._log.info("Force reminder skipped — schedule is not pending", {
        scheduleId,
        status: schedule.status,
      });
      return { sent: false, skippedReason: "NOT_PENDING", scheduleId, status: schedule.status };
    }

    const clinic = await this._clinicRepo.findById(schedule.clinic_id);
    if (!clinic?.whatsapp_phone_number_id) {
      throw new BookingError(
        `Clinic ${schedule.clinic_id} has no WhatsApp phone number configured`,
        "CLINIC_WHATSAPP_NOT_CONFIGURED",
        400,
        { clinicId: schedule.clinic_id },
      );
    }

    const result = await this._claimAndSend(schedule, clinic);
    return { sent: result.sent, skippedReason: result.skippedReason, scheduleId };
  }

  /**
   * Checks the two-gate template-live condition BEFORE claiming, then
   * claims (atomic, at-most-once) and sends. Four distinct outcomes:
   *
   *   - Template not live (either gate off): skipped WITHOUT claiming — the
   *     schedule stays `pending` so it's retried on a later sweep once
   *     WHATSAPP_VACCINATION_REMINDER_TEMPLATE_LIVE is flipped on.
   *     skippedReason: "TEMPLATE_NOT_LIVE".
   *   - Already claimed/sent/completed elsewhere: skippedReason
   *     "ALREADY_SENT".
   *   - Claim succeeds but the actual send throws (e.g. a real Meta error)
   *     and the schedule hasn't yet hit MAX_VACCINATION_REMINDER_ATTEMPTS:
   *     the claim is released — rolled back to `pending`
   *     (reminder_sent_at cleared, reminder_attempts incremented) — so the
   *     schedule is retried on the next sweep instead of being permanently
   *     stuck as "sent" despite never being delivered. skippedReason
   *     "CLAIM_OR_SEND_FAILED".
   *   - Claim succeeds but the send throws and this was the
   *     MAX_VACCINATION_REMINDER_ATTEMPTS-th consecutive failure: the
   *     schedule is moved to the terminal `reminder_failed` status instead
   *     — never retried again, ops is alerted once for the permanent
   *     failure, and the row is left visible on the dashboard for manual
   *     follow-up. skippedReason "MAX_ATTEMPTS_EXCEEDED".
   *
   * @param {object} schedule
   * @param {object|null} [clinicHint] Pre-fetched clinic (avoids a second lookup in sendReminderNow)
   * @returns {Promise<{ sent: boolean; skippedReason: string|null }>}
   */
  async _claimAndSend(schedule, clinicHint = null) {
    const log = this._log.child({ clinicId: schedule.clinic_id, scheduleId: schedule.id });

    const live = isTemplateLive(VACCINATION_REMINDER_TEMPLATE_NAME, {
      globalLive: this._templatesLive,
      templateLive: this._vaccinationReminderTemplateLive,
    });
    if (!live) {
      log.info(
        "vaccination_reminder is not live — skipping without claiming (template pending Meta approval)",
        { vaccineName: schedule.vaccine_name, dueDate: schedule.due_date },
      );
      return { sent: false, skippedReason: "TEMPLATE_NOT_LIVE" };
    }

    let claimed;
    try {
      claimed = await this._vaccinations.claimReminderSent(schedule.id);
    } catch (err) {
      log.error("Failed to claim vaccination reminder", {
        error: err instanceof Error ? err.message : String(err),
      });
      await alertOps({
        title: "Failed to claim vaccination reminder",
        step: OPS_ALERT_STEP.VACCINATION_REMINDER_CLAIM,
        error: err,
        clinicId: schedule.clinic_id,
        patientId: schedule.patient_id,
        extra: { scheduleId: schedule.id, vaccineName: schedule.vaccine_name },
      });
      return { sent: false, skippedReason: "CLAIM_OR_SEND_FAILED" };
    }
    if (!claimed) {
      log.info("Vaccination reminder already claimed/sent/completed elsewhere — skipping");
      return { sent: false, skippedReason: "ALREADY_SENT" };
    }

    try {
      const clinic = clinicHint ?? (await this._clinicRepo.findById(claimed.clinic_id));
      if (!clinic?.whatsapp_phone_number_id) {
        throw new Error(`Clinic ${claimed.clinic_id} has no WhatsApp phone number configured`);
      }

      const patient = await this._patientRepo.findById(claimed.clinic_id, claimed.patient_id);
      const patientName = patient?.full_name ?? "there";
      // 4 params, matching VACCINATION_REMINDER_TEMPLATE_BODY's 4
      // placeholders exactly — {{2}} is patientName again (the template
      // text itself appends the possessive "'s"), NOT a 3rd distinct
      // value. Sending only 3 here previously caused Meta error 132000
      // (see constants.js's param-count-fix note) — do not drop back to
      // 3 without also updating the approved template on Meta's side.
      const bodyParams = [
        patientName,
        patientName,
        claimed.vaccine_name,
        formatDueDateLabel(claimed.due_date),
      ];

      await sendVaccinationReminder(clinic.whatsapp_phone_number_id, patient?.contact_phone, {
        whatsappClient: this._wa,
        bodyParams,
        templatesLive: this._templatesLive,
        vaccinationReminderTemplateLive: this._vaccinationReminderTemplateLive,
      });
      log.info("Sent vaccination reminder", {
        vaccineName: claimed.vaccine_name,
        dueDate: claimed.due_date,
      });
      return { sent: true, skippedReason: null };
    } catch (err) {
      log.error("Failed to send vaccination reminder after claiming it", {
        vaccineName: claimed.vaccine_name,
        dueDate: claimed.due_date,
        priorAttempts: claimed.reminder_attempts ?? 0,
        error: err instanceof Error ? err.message : String(err),
      });
      await alertOps({
        title: "Failed to send vaccination reminder after claiming it",
        step: OPS_ALERT_STEP.VACCINATION_REMINDER_SEND,
        error: err,
        clinicId: claimed.clinic_id,
        patientId: claimed.patient_id,
        extra: { scheduleId: claimed.id, vaccineName: claimed.vaccine_name, dueDate: claimed.due_date },
      });

      try {
        const { exhausted, attempts } = await this._vaccinations.recordReminderFailure(
          claimed.id,
          claimed.reminder_attempts ?? 0,
          MAX_VACCINATION_REMINDER_ATTEMPTS,
        );

        if (exhausted) {
          // Distinct from the "released for retry" line below — this
          // schedule will NEVER be retried again (findDueForReminder only
          // selects `pending`), so it must not look like a routine
          // per-run skip in the logs.
          log.error(
            "Vaccination reminder permanently failed — exceeded max attempts, giving up and marking reminder_failed",
            { vaccineName: claimed.vaccine_name, dueDate: claimed.due_date, attempts, maxAttempts: MAX_VACCINATION_REMINDER_ATTEMPTS },
          );
          await alertOps({
            title: `Vaccination reminder permanently failed after ${attempts} attempts — manual follow-up needed`,
            step: OPS_ALERT_STEP.VACCINATION_REMINDER_EXHAUSTED,
            error: err,
            clinicId: claimed.clinic_id,
            patientId: claimed.patient_id,
            extra: {
              scheduleId: claimed.id,
              vaccineName: claimed.vaccine_name,
              dueDate: claimed.due_date,
              attempts,
            },
          });
          return { sent: false, skippedReason: "MAX_ATTEMPTS_EXCEEDED" };
        }

        // Claim released — distinct log line (separate from the
        // "CLAIM_OR_SEND_FAILED" skip reason above) so a released-for-retry
        // claim is traceable without cross-referencing skippedReason.
        log.warn("Vaccination reminder claim released — reverted to pending for retry on next sweep", {
          vaccineName: claimed.vaccine_name,
          dueDate: claimed.due_date,
          attempts,
          maxAttempts: MAX_VACCINATION_REMINDER_ATTEMPTS,
        });
      } catch (recordErr) {
        log.error("Failed to record reminder failure / release claim — record may be stuck as reminder_sent", {
          error: recordErr instanceof Error ? recordErr.message : String(recordErr),
        });
        await alertOps({
          title: "Failed to release vaccination reminder claim after send failure — record may be stuck as reminder_sent",
          step: OPS_ALERT_STEP.VACCINATION_REMINDER_REVERT,
          error: recordErr,
          clinicId: claimed.clinic_id,
          patientId: claimed.patient_id,
          extra: { scheduleId: claimed.id },
        });
      }
      return { sent: false, skippedReason: "CLAIM_OR_SEND_FAILED" };
    }
  }
}
