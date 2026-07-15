/**
 * @fileoverview ReminderService — Session 5 (REMINDER_SENT, system-triggered).
 *
 * Two independent responsibilities, both driven by the cron route
 * (/api/cron/booking-reminders — see that file):
 *
 *   1. runReminderSweep(): loops every clinic with WhatsApp configured,
 *      finds CONFIRMED appointments crossing that clinic's T-24h / T-2h
 *      thresholds, and sends the reminder template — logged-only unless
 *      WHATSAPP_TEMPLATES_LIVE=true (see _sendReminder). Also completes
 *      past-due CONFIRMED appointments that got no reply (step 5 —
 *      no-response timeout; NO_SHOW tracking deferred per spec, hardcoded
 *      COMPLETED-only).
 *
 *   2. handleQuickReply(): Confirm/Cancel/Reschedule replies to a reminder.
 *      Routed here directly from the WhatsApp webhook route BEFORE
 *      conversationStateService (see that route's header note) — reminder
 *      replies self-identify their target appointment via the button id
 *      (lib/reminder-reply.js) and deliberately never touch
 *      conversation_state (see constants.js's REMINDER_SENT section for why).
 *
 * Every mutation goes through AppointmentRepository's atomic
 * conditional-UPDATE methods (claimReminder, cancelViaReminderReply,
 * requestRescheduleViaReminderReply) — never read-then-write — so a
 * redelivered WhatsApp webhook or an overlapping cron tick can't
 * double-send a reminder or double-apply a quick-reply.
 */

import {
  REMINDER_KIND,
  REMINDER_SENT_AT_COLUMN,
  REMINDER_OFFSET_COLUMN,
  REMINDER_DEFAULT_OFFSET_MINUTES,
  REMINDER_WINDOW_MINUTES,
  REMINDER_TEMPLATE_NAME,
  REMINDER_TEMPLATE_LANGUAGE_CODE,
  REMINDER_REPLY_ACTION,
  REMINDER_COPY,
  HANDOFF_REASON,
  APPOINTMENT_STATUS,
} from "../constants.js";
import { reminderReplyId, parseReminderReplyId } from "../lib/reminder-reply.js";
import { formatSlotLabel } from "../lib/slot-engine.js";
import { createLogger } from "../logger.js";

export class ReminderService {
  /**
   * @param {import("../repository/clinic.repository.js").ClinicRepository} clinicRepository
   * @param {import("../repository/appointment.repository.js").AppointmentRepository} appointmentRepository
   * @param {import("../repository/patient.repository.js").PatientRepository} patientRepository
   * @param {import("./whatsapp-client.service.js").WhatsAppClientService} whatsappClient
   * @param {import("./doctor-notification.service.js").DoctorNotificationService} doctorNotificationService
   * @param {{ templatesLive?: boolean; doctorProfileRepository?: import("../repository/doctor-profile.repository.js").DoctorProfileRepository|null }} [opts]
   */
  constructor(clinicRepository, appointmentRepository, patientRepository, whatsappClient, doctorNotificationService, { templatesLive = false, doctorProfileRepository = null } = {}) {
    this._clinicRepo      = clinicRepository;
    this._appointmentRepo = appointmentRepository;
    this._patientRepo     = patientRepository;
    this._wa              = whatsappClient;
    this._doctorNotifier  = doctorNotificationService;
    this._doctorProfileRepo = doctorProfileRepository;
    this._templatesLive   = templatesLive;
    this._log             = createLogger({ component: "ReminderService" });
  }

  // ─────────────────────────────────────────────────────────────
  // Cron entry point (steps 1-2-3-5: query + send + no-response timeout)
  // ─────────────────────────────────────────────────────────────

  /**
   * @returns {Promise<{ clinicsScanned: number; remindersSent: number; remindersFailed: number; completedNoResponse: number }>}
   */
  async runReminderSweep() {
    const nowIso = new Date().toISOString();
    const clinics = await this._clinicRepo.findAllWithWhatsAppConfigured();
    const summary = { clinicsScanned: clinics.length, remindersSent: 0, remindersFailed: 0, completedNoResponse: 0 };

    for (const clinic of clinics) {
      const log = this._log.child({ clinicId: clinic.id });

      const remindersEnabled = await this._areRemindersEnabledForClinic(clinic.id, log);
      if (remindersEnabled) {
        for (const kind of Object.values(REMINDER_KIND)) {
          const { sent, failed } = await this._sweepClinicForKind(clinic, kind, nowIso, log);
          summary.remindersSent += sent;
          summary.remindersFailed += failed;
        }
      } else {
        log.info("Reminders disabled for clinic — skipping reminder send sweep");
      }

      try {
        const completed = await this._appointmentRepo.completeExpiredConfirmed(clinic.id, nowIso);
        summary.completedNoResponse += completed.length;
        if (completed.length > 0) {
          log.info("Completed past-due CONFIRMED appointments with no reply", { count: completed.length });
        }
      } catch (err) {
        log.error("Failed to complete expired CONFIRMED appointments", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this._log.info("Reminder sweep finished", summary);
    return summary;
  }

  /**
   * Defaults to enabled when no repository is wired (tests) or no profile row exists.
   */
  async _areRemindersEnabledForClinic(clinicId, log) {
    if (!this._doctorProfileRepo) return true;

    try {
      return await this._doctorProfileRepo.isRemindersEnabledForClinic(clinicId);
    } catch (err) {
      log.error("Failed to read reminders_enabled — defaulting to enabled", {
        error: err instanceof Error ? err.message : String(err),
      });
      return true;
    }
  }

  /** @returns {Promise<{ sent: number; failed: number }>} */
  async _sweepClinicForKind(clinic, kind, nowIso, log) {
    const offsetMinutes = clinic[REMINDER_OFFSET_COLUMN[kind]] ?? REMINDER_DEFAULT_OFFSET_MINUTES[kind];
    const windowEndMs = Date.parse(nowIso) + offsetMinutes * 60_000;
    const windowStartMs = windowEndMs - REMINDER_WINDOW_MINUTES * 60_000;
    const fromIso = new Date(windowStartMs).toISOString();
    const toIso = new Date(windowEndMs).toISOString();
    const sentAtColumn = REMINDER_SENT_AT_COLUMN[kind];

    let due;
    try {
      due = await this._appointmentRepo.findDueForReminder(clinic.id, sentAtColumn, fromIso, toIso);
    } catch (err) {
      log.error("Failed to query due reminders", { kind, error: err instanceof Error ? err.message : String(err) });
      return { sent: 0, failed: 0 };
    }

    const results = await Promise.all(
      due.map((appointment) => this._claimAndSend(clinic, appointment, kind, log)),
    );
    const sent = results.filter(Boolean).length;
    const failed = results.length - sent;
    return { sent, failed };
  }

  /**
   * Claims the reminder (atomic, at-most-once) then sends it. If the claim
   * itself fails or is already taken, nothing is sent. If the claim
   * succeeds but the send throws, this is deliberately NOT retried — see
   * this file's header comment on the claim-before-send trade-off (favors
   * never double-sending over guaranteed delivery); the failure is logged
   * loudly so it's visible rather than silently lost.
   */
  async _claimAndSend(clinic, appointment, kind, log) {
    const sentAtColumn = REMINDER_SENT_AT_COLUMN[kind];
    let claimed;
    try {
      claimed = await this._appointmentRepo.claimReminder(clinic.id, appointment.id, sentAtColumn);
    } catch (err) {
      log.error("Failed to claim reminder", {
        appointmentId: appointment.id,
        kind,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
    if (!claimed) {
      log.info("Reminder already claimed elsewhere — skipping", { appointmentId: appointment.id, kind });
      return false;
    }

    try {
      await this._sendReminder(clinic, claimed, kind, log);
      return true;
    } catch (err) {
      log.error("Failed to send reminder after claiming it — will not retry this run", {
        appointmentId: appointment.id,
        kind,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  async _sendReminder(clinic, appointment, kind, log) {
    const patient = appointment.patient_id
      ? await this._patientRepo.findById(clinic.id, appointment.patient_id)
      : null;
    const patientName = patient?.full_name ?? "there";
    const clinicName = clinic.name ?? "our clinic";
    const slotLabel = formatSlotLabel(new Date(appointment.slot_start));

    const bodyTemplate = kind === REMINDER_KIND.H24 ? REMINDER_COPY.H24_BODY : REMINDER_COPY.H2_BODY;
    const bodyTextPreview = bodyTemplate
      .replace("{patientName}", patientName)
      .replace("{clinicName}", clinicName)
      .replace("{slotLabel}", slotLabel);

    const templateName = REMINDER_TEMPLATE_NAME[kind];
    const bodyParams = [patientName, clinicName, slotLabel];
    const buttonPayloads = [
      { index: 0, payload: reminderReplyId(REMINDER_REPLY_ACTION.CONFIRM, appointment.id) },
      { index: 1, payload: reminderReplyId(REMINDER_REPLY_ACTION.CANCEL, appointment.id) },
      { index: 2, payload: reminderReplyId(REMINDER_REPLY_ACTION.RESCHEDULE, appointment.id) },
    ];

    if (!this._templatesLive) {
      log.info("WHATSAPP_TEMPLATES_LIVE=false — logging reminder instead of calling the Meta API", {
        appointmentId: appointment.id,
        kind,
        templateName,
        languageCode: REMINDER_TEMPLATE_LANGUAGE_CODE,
        recipient: appointment.contact_phone,
        bodyParams,
        bodyTextPreview,
        buttonPayloads,
      });
      return;
    }

    await this._wa.sendTemplate(clinic.whatsapp_phone_number_id, appointment.contact_phone, {
      templateName,
      languageCode: REMINDER_TEMPLATE_LANGUAGE_CODE,
      bodyParams,
      buttonPayloads,
    });
    log.info("Sent reminder template", { appointmentId: appointment.id, kind, templateName });
  }

  // ─────────────────────────────────────────────────────────────
  // Quick-reply handling (Confirm/Cancel/Reschedule)
  // ─────────────────────────────────────────────────────────────

  /**
   * @param {object} params
   * @param {import("../repository/clinic.repository.js").BookingClinic} params.clinic
   * @param {import("../lib/webhook-parser.js").NormalizedInboundMessage} params.message
   * @returns {Promise<{ handled: boolean; action: string }>}
   */
  async handleQuickReply({ clinic, message }) {
    const log = this._log.child({ clinicId: clinic.id, waMessageId: message.waMessageId });
    const parsed = parseReminderReplyId(message.replyId);
    if (!parsed) {
      // Should never happen — the webhook route only calls this after
      // matching the reminder-reply id pattern itself (isReminderReplyId).
      log.warn("handleQuickReply invoked with a non-reminder replyId", { replyId: message.replyId });
      return { handled: false, action: "NOT_A_REMINDER_REPLY" };
    }

    const { action, appointmentId } = parsed;
    const appointment = await this._appointmentRepo.findByIdForClinic(clinic.id, appointmentId);
    if (!appointment) {
      log.warn("Reminder reply for an appointment that no longer exists", { appointmentId, action });
      await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, REMINDER_COPY.STALE_OR_UNKNOWN_REPLY);
      return { handled: true, action: "STALE_APPOINTMENT" };
    }

    if (action === REMINDER_REPLY_ACTION.CONFIRM) {
      return this._handleConfirm({ clinic, message, appointment, log });
    }
    if (action === REMINDER_REPLY_ACTION.CANCEL) {
      return this._handleCancel({ clinic, message, appointment, log });
    }
    return this._handleReschedule({ clinic, message, appointment, log });
  }

  async _handleConfirm({ clinic, message, appointment, log }) {
    if (appointment.status !== APPOINTMENT_STATUS.CONFIRMED) {
      await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, REMINDER_COPY.STALE_OR_UNKNOWN_REPLY);
      log.info("Confirm reply for an appointment no longer CONFIRMED — informed contact", {
        appointmentId: appointment.id,
        status: appointment.status,
      });
      return { handled: true, action: "STALE_APPOINTMENT" };
    }
    await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, REMINDER_COPY.CONFIRM_ACK);
    log.info("Reminder Confirm acknowledged — no state change", { appointmentId: appointment.id });
    return { handled: true, action: "REMINDER_CONFIRMED" };
  }

  async _handleCancel({ clinic, message, appointment, log }) {
    const cancelled = await this._appointmentRepo.cancelViaReminderReply(clinic.id, appointment.id);
    if (!cancelled) {
      await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, REMINDER_COPY.STALE_OR_UNKNOWN_REPLY);
      log.info("Cancel reply for an appointment no longer CONFIRMED — no-op", { appointmentId: appointment.id });
      return { handled: true, action: "STALE_APPOINTMENT" };
    }
    const slotLabel = formatSlotLabel(new Date(cancelled.slot_start));
    await this._wa.sendText(
      clinic.whatsapp_phone_number_id,
      message.contactPhone,
      REMINDER_COPY.CANCEL_ACK.replace("{slotLabel}", slotLabel),
    );
    log.info("Appointment cancelled via reminder reply", { appointmentId: appointment.id });
    return { handled: true, action: "CANCELLED" };
  }

  async _handleReschedule({ clinic, message, appointment, log }) {
    const updated = await this._appointmentRepo.requestRescheduleViaReminderReply(clinic.id, appointment.id);
    if (!updated) {
      await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, REMINDER_COPY.STALE_OR_UNKNOWN_REPLY);
      log.info("Reschedule reply for an appointment no longer CONFIRMED — no-op", { appointmentId: appointment.id });
      return { handled: true, action: "STALE_APPOINTMENT" };
    }
    await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, REMINDER_COPY.RESCHEDULE_ACK);
    await this._doctorNotifier.notifyHandoff({
      clinic,
      message,
      reason: HANDOFF_REASON.RESCHEDULE_REQUESTED_VIA_REMINDER,
      log,
    });
    log.info("Reschedule requested via reminder reply — flagged for manual follow-up", { appointmentId: appointment.id });
    return { handled: true, action: "RESCHEDULE_REQUESTED" };
  }
}
