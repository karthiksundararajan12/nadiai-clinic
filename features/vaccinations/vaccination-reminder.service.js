/**
 * @fileoverview VaccinationReminderService — daily cron sweep (see
 * app/api/cron/vaccination-reminders/route.js):
 *
 *   1. runReminderSweep(): finds `vaccination_schedules` rows due within
 *      VACCINATION_REMINDER_LEAD_DAYS that are still `pending`, atomically
 *      claims + sends a WhatsApp reminder (template `vaccination_reminder`
 *      — NOT yet approved by Meta, so sends are logged-only unless
 *      WHATSAPP_TEMPLATES_LIVE=true, same pattern ReminderService and
 *      sendInvoiceDocument used before their templates were approved). On
 *      success: status -> reminder_sent, reminder_sent_at = now(). Also
 *      sweeps `reminder_sent` rows whose due_date has passed to `overdue`.
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
 * conditional-UPDATE methods (claimReminderSent, markOverdue) — never
 * read-then-write — so an overlapping cron tick or a redelivered force-send
 * can't double-send a reminder (dedup on reminder_sent).
 */

import {
  VACCINATION_STATUS,
  VACCINATION_REMINDER_LEAD_DAYS,
  VACCINATION_REMINDER_TEMPLATE_NAME,
  VACCINATION_REMINDER_TEMPLATE_LANGUAGE_CODE,
} from "./constants.js";
import { BookingError } from "../booking/errors.js";
import { createLogger } from "../booking/logger.js";

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

/** @param {string} dueDate YYYY-MM-DD @returns {string} e.g. "3 Aug 2026" */
function formatDueDateLabel(dueDate) {
  try {
    return new Date(`${dueDate}T00:00:00+05:30`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dueDate;
  }
}

/**
 * Sends (or, until the template is approved, logs) one vaccination
 * reminder. Guarded exactly like sendInvoiceDocument was guarded before
 * `appt_invoice` was approved — do not flip WHATSAPP_TEMPLATES_LIVE for
 * this template until `vaccination_reminder` is confirmed APPROVED in Meta
 * Business Manager, or a real send will be rejected by the Graph API.
 *
 * @param {string} phoneNumberId Clinic's Meta phone_number_id
 * @param {string} patientPhone WhatsApp `to` (digits, no +)
 * @param {{
 *   whatsappClient?: import("../booking/services/whatsapp-client.service.js").WhatsAppClientService;
 *   bodyParams: string[];
 *   templatesLive?: boolean;
 * }} opts
 * @returns {Promise<{ stubbed?: true; templateName: string; templateSent?: boolean }>}
 */
export async function sendVaccinationReminder(phoneNumberId, patientPhone, opts) {
  const {
    whatsappClient,
    bodyParams,
    templatesLive = process.env.WHATSAPP_TEMPLATES_LIVE === "true",
  } = opts ?? {};

  if (!templatesLive) {
    createLogger({ component: "sendVaccinationReminder" }).info(
      "WHATSAPP_TEMPLATES_LIVE=false — skipping vaccination_reminder WhatsApp send (template pending Meta approval)",
      {
        phoneNumberId,
        patientPhone,
        templateName: VACCINATION_REMINDER_TEMPLATE_NAME,
        bodyParams,
      },
    );
    return { stubbed: true, templateName: VACCINATION_REMINDER_TEMPLATE_NAME };
  }

  if (!whatsappClient) {
    throw new Error("sendVaccinationReminder requires whatsappClient when WHATSAPP_TEMPLATES_LIVE=true");
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
   * @param {{ templatesLive?: boolean }} [opts]
   */
  constructor(vaccinationRepository, clinicRepository, patientRepository, whatsappClient, { templatesLive = false } = {}) {
    this._vaccinations = vaccinationRepository;
    this._clinicRepo = clinicRepository;
    this._patientRepo = patientRepository;
    this._wa = whatsappClient;
    this._templatesLive = templatesLive;
    this._log = createLogger({ component: "VaccinationReminderService" });
  }

  /**
   * @param {Date} [now]
   * @returns {Promise<{ scanned: number; remindersSent: number; remindersFailed: number; markedOverdue: number }>}
   */
  async runReminderSweep(now = new Date()) {
    const cutoffDate = istDateKey(
      new Date(now.getTime() + VACCINATION_REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000),
    );
    const todayDate = istDateKey(now);

    const due = await this._vaccinations.findDueForReminder(cutoffDate);
    const results = await Promise.all(due.map((schedule) => this._claimAndSend(schedule)));
    const remindersSent = results.filter(Boolean).length;
    const remindersFailed = results.length - remindersSent;

    let markedOverdue = 0;
    try {
      const overdueRows = await this._vaccinations.markOverdue(todayDate);
      markedOverdue = overdueRows.length;
    } catch (err) {
      this._log.error("Failed to sweep overdue vaccination schedules", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const summary = { scanned: due.length, remindersSent, remindersFailed, markedOverdue };
    this._log.info("Vaccination reminder sweep finished", summary);
    return summary;
  }

  /**
   * On-demand / test trigger: claims + sends one reminder regardless of
   * due_date, bypassing the lead-time window. Still uses the same atomic
   * claimReminderSent path (at-most-once) and the same
   * WHATSAPP_TEMPLATES_LIVE gate as the cron sweep.
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

    const sent = await this._claimAndSend(schedule, clinic);
    return { sent, skippedReason: sent ? null : "CLAIM_OR_SEND_FAILED", scheduleId };
  }

  /**
   * Claims the reminder (atomic, at-most-once) then sends it. If the claim
   * itself fails or is already taken, nothing is sent. If the claim
   * succeeds but the send throws, this is deliberately NOT retried — same
   * trade-off documented in ReminderService (favors never double-sending
   * over guaranteed delivery); the failure is logged loudly instead of
   * silently lost.
   *
   * @param {object} schedule
   * @param {object|null} [clinicHint] Pre-fetched clinic (avoids a second lookup in sendReminderNow)
   * @returns {Promise<boolean>}
   */
  async _claimAndSend(schedule, clinicHint = null) {
    const log = this._log.child({ clinicId: schedule.clinic_id, scheduleId: schedule.id });

    let claimed;
    try {
      claimed = await this._vaccinations.claimReminderSent(schedule.id);
    } catch (err) {
      log.error("Failed to claim vaccination reminder", {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
    if (!claimed) {
      log.info("Vaccination reminder already claimed/sent/completed elsewhere — skipping");
      return false;
    }

    try {
      const clinic = clinicHint ?? (await this._clinicRepo.findById(claimed.clinic_id));
      if (!clinic?.whatsapp_phone_number_id) {
        throw new Error(`Clinic ${claimed.clinic_id} has no WhatsApp phone number configured`);
      }

      const patient = await this._patientRepo.findById(claimed.clinic_id, claimed.patient_id);
      const patientName = patient?.full_name ?? "there";
      const bodyParams = [patientName, claimed.vaccine_name, formatDueDateLabel(claimed.due_date)];

      await sendVaccinationReminder(clinic.whatsapp_phone_number_id, patient?.contact_phone, {
        whatsappClient: this._wa,
        bodyParams,
        templatesLive: this._templatesLive,
      });
      log.info("Sent (or logged) vaccination reminder", {
        vaccineName: claimed.vaccine_name,
        dueDate: claimed.due_date,
      });
      return true;
    } catch (err) {
      // Claim already stamped reminder_sent — we will NOT clear it (avoids
      // double-send on retry). Log everything actionable so this doesn't
      // look like a silent success.
      log.error("Failed to send vaccination reminder after claiming it — will not retry this run", {
        vaccineName: claimed.vaccine_name,
        dueDate: claimed.due_date,
        claimLeftReminderSentSet: true,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }
}
