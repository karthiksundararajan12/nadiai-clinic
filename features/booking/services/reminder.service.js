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
 *      (lib/reminder-reply.js). Confirm/Cancel stay appointment-scoped
 *      (no conversation_state). Reschedule hands off into
 *      SlotSelectionService.enterRescheduleFlow so the patient can pick a
 *      new slot on the SAME appointments row.
 *
 * Every mutation goes through AppointmentRepository's atomic
 * conditional-UPDATE methods (claimReminder, cancelViaReminderReply,
 * rescheduleConfirmedSlot) — never read-then-write — so a redelivered
 * WhatsApp webhook or an overlapping cron tick can't double-send a
 * reminder or double-apply a quick-reply.
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
  APPOINTMENT_STATUS,
} from "../constants.js";
import { reminderReplyId, parseReminderReplyId } from "../lib/reminder-reply.js";
import { formatSlotLabel } from "../lib/slot-engine.js";
import { BookingError } from "../errors.js";
import { createLogger } from "../logger.js";

export class ReminderService {
  /**
   * @param {import("../repository/clinic.repository.js").ClinicRepository} clinicRepository
   * @param {import("../repository/appointment.repository.js").AppointmentRepository} appointmentRepository
   * @param {import("../repository/patient.repository.js").PatientRepository} patientRepository
   * @param {import("./whatsapp-client.service.js").WhatsAppClientService} whatsappClient
   * @param {import("./doctor-notification.service.js").DoctorNotificationService} doctorNotificationService
   * @param {{
   *   templatesLive?: boolean;
   *   doctorProfileRepository?: import("../repository/doctor-profile.repository.js").DoctorProfileRepository|null;
   *   slotSelectionService?: import("./slot-selection.service.js").SlotSelectionService|null;
   *   inAppNotificationService?: import("./in-app-notification.service.js").InAppNotificationService|null;
   * }} [opts]
   */
  constructor(clinicRepository, appointmentRepository, patientRepository, whatsappClient, doctorNotificationService, {
    templatesLive = false,
    doctorProfileRepository = null,
    slotSelectionService = null,
    inAppNotificationService = null,
  } = {}) {
    this._clinicRepo      = clinicRepository;
    this._appointmentRepo = appointmentRepository;
    this._patientRepo     = patientRepository;
    this._wa              = whatsappClient;
    this._doctorNotifier  = doctorNotificationService;
    this._doctorProfileRepo = doctorProfileRepository;
    this._slotSelection   = slotSelectionService;
    this._inAppNotificationService = inAppNotificationService;
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
   * On-demand / test trigger: claim + send one reminder for a specific
   * CONFIRMED appointment, **bypassing the T-24h / T-2h time window**.
   * Still uses the same atomic claimReminder path (at-most-once) and the
   * same WHATSAPP_TEMPLATES_LIVE gate as the cron sweep.
   *
   * Intended for protected admin/cron callers (CRON_SECRET) only — never
   * expose without auth.
   *
   * @param {{ appointmentId: string; kind: string }} params
   *   `kind` is one of REMINDER_KIND (`"24h"` | `"2h"`).
   * @returns {Promise<{ sent: boolean; skippedReason: string|null; appointmentId: string; kind: string }>}
   */
  async sendReminderNow({ appointmentId, kind }) {
    if (!Object.values(REMINDER_KIND).includes(kind)) {
      throw new BookingError(
        `Invalid reminder kind "${kind}" — expected one of: ${Object.values(REMINDER_KIND).join(", ")}`,
        "INVALID_REMINDER_KIND",
        400,
        { kind },
      );
    }
    if (!appointmentId) {
      throw new BookingError("appointmentId is required", "MISSING_APPOINTMENT_ID", 400);
    }

    const appointment = await this._appointmentRepo.findById(appointmentId);
    if (!appointment) {
      throw new BookingError(
        `Appointment ${appointmentId} not found`,
        "APPOINTMENT_NOT_FOUND",
        404,
        { appointmentId },
      );
    }

    const clinic = await this._clinicRepo.findById(appointment.clinic_id);
    if (!clinic?.whatsapp_phone_number_id) {
      throw new BookingError(
        `Clinic ${appointment.clinic_id} has no WhatsApp phone number configured`,
        "CLINIC_WHATSAPP_NOT_CONFIGURED",
        400,
        { clinicId: appointment.clinic_id },
      );
    }

    const log = this._log.child({ clinicId: clinic.id, appointmentId, kind, forceSend: true });

    if (appointment.status !== APPOINTMENT_STATUS.CONFIRMED) {
      log.info("Force reminder skipped — appointment is not CONFIRMED", { status: appointment.status });
      return { sent: false, skippedReason: "NOT_CONFIRMED", appointmentId, kind };
    }

    const sentAtColumn = REMINDER_SENT_AT_COLUMN[kind];
    if (appointment[sentAtColumn]) {
      log.info("Force reminder skipped — already claimed/sent", { sentAtColumn });
      return { sent: false, skippedReason: "ALREADY_SENT", appointmentId, kind };
    }

    const remindersEnabled = await this._areRemindersEnabledForClinic(clinic.id, log);
    if (!remindersEnabled) {
      log.info("Force reminder skipped — reminders disabled for clinic");
      return { sent: false, skippedReason: "REMINDERS_DISABLED", appointmentId, kind };
    }

    const sent = await this._claimAndSend(clinic, appointment, kind, log);
    return {
      sent,
      skippedReason: sent ? null : "CLAIM_OR_SEND_FAILED",
      appointmentId,
      kind,
    };
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
   *
   * @returns {Promise<boolean>}
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
        sentAtColumn,
        error: err instanceof Error ? err.message : String(err),
        errorName: err instanceof Error ? err.name : undefined,
        errorCode: err?.code ?? null,
        errorDetails: err?.details ?? (err?.cause ?? null),
      });
      return false;
    }
    if (!claimed) {
      log.info("Reminder already claimed elsewhere — skipping", {
        appointmentId: appointment.id,
        kind,
        sentAtColumn,
      });
      return false;
    }

    try {
      await this._sendReminder(clinic, claimed, kind, log);
      return true;
    } catch (err) {
      // Claim already stamped sent_at — we will NOT clear it (avoids double-send
      // on retry). Log everything actionable from the WhatsApp/Meta error so
      // this doesn't look like a silent success in the DB.
      log.error("Failed to send reminder after claiming it — will not retry this run", {
        appointmentId: appointment.id,
        kind,
        sentAtColumn,
        templateName: REMINDER_TEMPLATE_NAME[kind],
        languageCode: REMINDER_TEMPLATE_LANGUAGE_CODE,
        recipient: appointment.contact_phone,
        phoneNumberId: clinic.whatsapp_phone_number_id,
        claimLeftSentAtSet: true,
        error: err instanceof Error ? err.message : String(err),
        errorName: err instanceof Error ? err.name : undefined,
        errorCode: err?.code ?? null,
        errorDetails: err?.details ?? (err?.cause ?? null),
        errorStack: err instanceof Error ? err.stack : undefined,
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
    // No patient_confirmed / reminder_confirmed column exists — ack only.
    await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, REMINDER_COPY.CONFIRM_ACK);
    log.info("Reminder Confirm acknowledged — no state change (no patient_confirmed column)", {
      appointmentId: appointment.id,
    });
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

    if (this._inAppNotificationService) {
      try {
        await this._inAppNotificationService.createAppointmentCancelled({
          clinicId: clinic.id,
          appointment: cancelled,
        });
      } catch (err) {
        log.error("Failed to create in-app cancel notification after reminder Cancel", {
          clinicId: clinic.id,
          appointmentId: cancelled.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.info("Appointment cancelled via reminder reply", { appointmentId: appointment.id });
    return { handled: true, action: "CANCELLED" };
  }

  async _handleReschedule({ clinic, message, appointment, log }) {
    if (appointment.status !== APPOINTMENT_STATUS.CONFIRMED) {
      await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, REMINDER_COPY.STALE_OR_UNKNOWN_REPLY);
      log.info("Reschedule reply for an appointment no longer CONFIRMED — no-op", {
        appointmentId: appointment.id,
        status: appointment.status,
      });
      return { handled: true, action: "STALE_APPOINTMENT" };
    }

    if (!this._slotSelection?.enterRescheduleFlow) {
      log.error("SlotSelectionService not wired — cannot self-serve reschedule", {
        appointmentId: appointment.id,
      });
      await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, REMINDER_COPY.STALE_OR_UNKNOWN_REPLY);
      return { handled: true, action: "RESCHEDULE_UNAVAILABLE" };
    }

    let patientName = null;
    if (appointment.patient_id) {
      const patient = await this._patientRepo.findById(clinic.id, appointment.patient_id);
      patientName = patient?.full_name ?? null;
    }

    const result = await this._slotSelection.enterRescheduleFlow({
      clinic,
      message,
      appointment,
      patientName,
      log,
    });
    log.info("Reschedule via reminder — entered SLOT_SELECTION self-serve flow", {
      appointmentId: appointment.id,
      action: result?.action,
    });
    return {
      handled: true,
      action: result?.action === "HUMAN_HANDOFF" ? "RESCHEDULE_HANDOFF" : "RESCHEDULE_SLOT_SELECTION",
      currentState: result?.currentState,
      appointmentId: appointment.id,
    };
  }
}
