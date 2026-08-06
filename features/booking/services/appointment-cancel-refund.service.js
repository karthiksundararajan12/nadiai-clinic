/**
 * @fileoverview Shared post-cancel side effects for CONFIRMED appointments:
 * Razorpay refund, patient WhatsApp ack, and in-app appointment_cancelled
 * notification. Used by ReminderService (WhatsApp Cancel / no-show) and the
 * doctor dashboard cancel / retry-refund routes — do not reimplement
 * refund/ack elsewhere.
 */

import {
  REFUND_STATUS,
  CAPTURED_PAYMENT_STATUSES,
  REMINDER_COPY,
  DOCTOR_CANCELLED_DASHBOARD_REASON,
  PATIENT_CANCELLED_MENU_REASON,
} from "../constants.js";
import { RefundRetryError } from "../errors.js";
import { formatSlotLabel } from "../lib/slot-engine.js";
import { maskPhoneForLog } from "../lib/phone.js";
import { isConversationExpired } from "../lib/conversation-expiry.js";
import { enrichRefundFailureAlertFromError } from "../lib/razorpay-refund-alert.js";
import { formatNotificationAmount } from "./in-app-notification.service.js";
import { createLogger } from "../logger.js";
import { alertOps, OPS_ALERT_STEP } from "../lib/alerting.js";

/** Meta Cloud API: re-engagement / outside 24h customer-service window. */
const META_SESSION_WINDOW_ERROR_CODE = 131047;

/**
 * Pull Meta error fields off a WhatsAppSendError (details = Graph API
 * `error` object) or a plain Error.
 *
 * @param {unknown} err
 * @returns {{ metaErrorCode: number|string|null; metaErrorMessage: string; metaErrorType: string|null }}
 */
function extractMetaSendError(err) {
  const details = err && typeof err === "object" ? err.details : null;
  const meta = details && typeof details === "object" ? details : null;
  return {
    metaErrorCode: meta?.code ?? null,
    metaErrorMessage:
      (typeof meta?.message === "string" && meta.message) ||
      (err instanceof Error ? err.message : String(err)),
    metaErrorType: typeof meta?.type === "string" ? meta.type : null,
  };
}

export class AppointmentCancelRefundService {
  /**
   * @param {import("../repository/appointment.repository.js").AppointmentRepository} appointmentRepository
   * @param {{
   *   razorpayClient?: import("./razorpay-client.service.js").RazorpayClientService|null;
   *   whatsappClient?: import("./whatsapp-client.service.js").WhatsAppClientService|null;
   *   inAppNotificationService?: import("./in-app-notification.service.js").InAppNotificationService|null;
   *   conversationStateRepository?: import("../repository/conversation-state.repository.js").ConversationStateRepository|null;
   * }} [opts]
   */
  constructor(appointmentRepository, {
    razorpayClient = null,
    whatsappClient = null,
    inAppNotificationService = null,
    conversationStateRepository = null,
  } = {}) {
    this._appointmentRepo = appointmentRepository;
    this._razorpayClient = razorpayClient;
    this._wa = whatsappClient;
    this._inAppNotificationService = inAppNotificationService;
    this._conversationStateRepo = conversationStateRepository;
    this._log = createLogger({ component: "AppointmentCancelRefundService" });
  }

  /**
   * Doctor dashboard cancel: flip CONFIRMED → cancelled
   * (cancellation_reason=doctor_cancelled_dashboard), then the same refund +
   * patient ack + in-app notify pipeline as reminder Cancel.
   *
   * @param {{
   *   clinic: { id: string; whatsapp_phone_number_id?: string|null };
   *   appointmentId: string;
   *   log?: import("../logger.js").Logger;
   * }} params
   * @returns {Promise<object|null>} cancelled appointment with refund fields, or null if not CONFIRMED
   */
  async cancelFromDoctorDashboard({ clinic, appointmentId, log = this._log }) {
    const cancelled = await this._appointmentRepo.cancelViaDoctorDashboard(
      clinic.id,
      appointmentId,
    );
    if (!cancelled) return null;

    const slotLabel = formatSlotLabel(new Date(cancelled.slot_start));
    return this.finalizeAfterCancel({
      clinic,
      appointment: cancelled,
      log,
      reason: DOCTOR_CANCELLED_DASHBOARD_REASON,
      buildAckBody: (_appt, refundOutcome) =>
        refundOutcome.refundInitiated
          ? REMINDER_COPY.CANCEL_ACK_WITH_REFUND.replace(
              "{amount}",
              formatNotificationAmount(cancelled.payment_amount),
            )
          : REMINDER_COPY.CANCEL_ACK.replace("{slotLabel}", slotLabel),
      contactPhone: cancelled.contact_phone,
      contextLabel: "doctor dashboard cancel",
    });
  }

  /**
   * START-menu "Cancel appointment": flip CONFIRMED → cancelled
   * (cancellation_reason=patient_cancelled_menu), then the same refund +
   * patient ack + in-app notify pipeline as reminder Cancel.
   *
   * @param {{
   *   clinic: { id: string; whatsapp_phone_number_id?: string|null };
   *   appointmentId: string;
   *   contactPhone?: string|null;
   *   log?: import("../logger.js").Logger;
   * }} params
   * @returns {Promise<object|null>}
   */
  async cancelFromPatientMenu({
    clinic,
    appointmentId,
    contactPhone = null,
    log = this._log,
  }) {
    const cancelled = await this._appointmentRepo.cancelViaMenu(clinic.id, appointmentId);
    if (!cancelled) return null;

    const slotLabel = formatSlotLabel(new Date(cancelled.slot_start));
    return this.finalizeAfterCancel({
      clinic,
      appointment: cancelled,
      log,
      reason: PATIENT_CANCELLED_MENU_REASON,
      buildAckBody: (_appt, refundOutcome) =>
        refundOutcome.refundInitiated
          ? REMINDER_COPY.CANCEL_ACK_WITH_REFUND.replace(
              "{amount}",
              formatNotificationAmount(cancelled.payment_amount),
            )
          : REMINDER_COPY.CANCEL_ACK.replace("{slotLabel}", slotLabel),
      contactPhone: contactPhone ?? cancelled.contact_phone,
      contextLabel: "START menu Cancel",
    });
  }

  /**
   * Doctor dashboard: retry Razorpay refund for an appointment whose prior
   * attempt persisted refund_status=failed. Does not re-send patient WhatsApp
   * or in-app cancel notifications — only the refund + DB fields.
   *
   * Uses a fresh idempotency key so a prior Razorpay 400 is not replayed from
   * the original `appt_cancel_{id}` key after balance is topped up.
   *
   * @param {{
   *   clinic: { id: string };
   *   appointmentId: string;
   *   log?: import("../logger.js").Logger;
   * }} params
   * @returns {Promise<object>} appointment with updated refund fields
   */
  async retryFailedRefund({ clinic, appointmentId, log = this._log }) {
    const appointment = await this._appointmentRepo.findByIdForClinic(
      clinic.id,
      appointmentId,
    );
    if (!appointment) {
      throw new RefundRetryError("Appointment not found", 404);
    }
    if (appointment.refund_status !== REFUND_STATUS.FAILED) {
      throw new RefundRetryError(
        `Refund can only be retried when refund_status is failed (current: ${appointment.refund_status ?? "null"})`,
        409,
        { refundStatus: appointment.refund_status ?? null },
      );
    }

    const paymentId = appointment.razorpay_payment_id ?? null;
    const paymentStatus = String(appointment.payment_status ?? "").toLowerCase();
    const hasCapturedPayment =
      Boolean(paymentId) && CAPTURED_PAYMENT_STATUSES.includes(paymentStatus);
    if (!hasCapturedPayment) {
      throw new RefundRetryError(
        "Appointment has no captured Razorpay payment eligible for refund",
        409,
        { paymentStatus: appointment.payment_status ?? null, paymentId },
      );
    }

    const reason =
      appointment.cancellation_reason || "manual_refund_retry_dashboard";
    const outcome = await this.refundAfterCancel({
      clinicId: clinic.id,
      appointment,
      log,
      reason,
      idempotencyKey: `appt_refund_retry_${appointment.id}_${Date.now()}`,
      throwOnFailure: true,
    });

    return {
      ...appointment,
      refund_status: outcome.refundStatus,
      refund_id: outcome.refundId ?? appointment.refund_id ?? null,
      refunded_at: outcome.refundedAt ?? appointment.refunded_at ?? null,
      payment_status: outcome.paymentStatus ?? appointment.payment_status ?? null,
    };
  }

  /**
   * Best-effort full refund after a cancel that may have a captured payment.
   * Failures are logged and persisted as refund_status=failed — never rethrown
   * unless `throwOnFailure` is set (manual Retry Refund).
   *
   * @param {{
   *   clinicId: string;
   *   appointment: object;
   *   log: import("../logger.js").Logger;
   *   reason?: string;
   *   idempotencyKey?: string|null;
   *   throwOnFailure?: boolean;
   * }} params
   * @returns {Promise<{
   *   refundStatus: string;
   *   refundInitiated: boolean;
   *   refundId?: string|null;
   *   refundedAt?: string|null;
   *   paymentStatus?: string|null;
   * }>}
   */
  async refundAfterCancel({
    clinicId,
    appointment,
    log,
    reason = "patient_cancelled_via_reminder",
    idempotencyKey = null,
    throwOnFailure = false,
  }) {
    const existing = appointment.refund_status ?? null;
    if (existing === REFUND_STATUS.COMPLETED || existing === REFUND_STATUS.PROCESSING) {
      log.info("Skipping Razorpay refund — already in progress or completed", {
        appointmentId: appointment.id,
        refundStatus: existing,
        paymentId: appointment.razorpay_payment_id ?? null,
      });
      return {
        refundStatus: existing,
        refundInitiated: existing === REFUND_STATUS.PROCESSING || existing === REFUND_STATUS.COMPLETED,
        refundId: appointment.refund_id ?? null,
        refundedAt: appointment.refunded_at ?? null,
      };
    }

    const paymentId = appointment.razorpay_payment_id ?? null;
    const paymentStatus = String(appointment.payment_status ?? "").toLowerCase();
    const hasCapturedPayment =
      Boolean(paymentId) && CAPTURED_PAYMENT_STATUSES.includes(paymentStatus);

    if (!hasCapturedPayment) {
      try {
        await this._appointmentRepo.updateRefundFields(clinicId, appointment.id, {
          refundStatus: REFUND_STATUS.NOT_APPLICABLE,
        });
      } catch (err) {
        log.error("Failed to persist refund_status=not_applicable after cancel", {
          appointmentId: appointment.id,
          error: err instanceof Error ? err.message : String(err),
        });
        await alertOps({
          title: "Failed to persist refund_status=not_applicable after cancel",
          step: OPS_ALERT_STEP.REFUND,
          error: err,
          clinicId,
          extra: { appointmentId: appointment.id },
        });
      }
      return { refundStatus: REFUND_STATUS.NOT_APPLICABLE, refundInitiated: false };
    }

    if (!this._razorpayClient) {
      log.error("Razorpay client not wired — cannot refund captured payment after cancel", {
        appointmentId: appointment.id,
        paymentId,
      });
      await alertOps({
        title: "Razorpay client not wired — cannot refund captured payment after cancel",
        step: OPS_ALERT_STEP.REFUND,
        error: new Error("Razorpay client not wired"),
        clinicId,
        extra: { appointmentId: appointment.id, paymentId },
      });
      try {
        await this._appointmentRepo.updateRefundFields(clinicId, appointment.id, {
          refundStatus: REFUND_STATUS.FAILED,
        });
      } catch (err) {
        log.error("Failed to persist refund_status=failed after missing Razorpay client", {
          appointmentId: appointment.id,
          paymentId,
          error: err instanceof Error ? err.message : String(err),
        });
        await alertOps({
          title: "Failed to persist refund_status=failed after missing Razorpay client",
          step: OPS_ALERT_STEP.REFUND,
          error: err,
          clinicId,
          extra: { appointmentId: appointment.id, paymentId },
        });
      }
      return { refundStatus: REFUND_STATUS.FAILED, refundInitiated: false };
    }

    try {
      await this._appointmentRepo.updateRefundFields(clinicId, appointment.id, {
        refundStatus: REFUND_STATUS.PROCESSING,
      });
    } catch (err) {
      log.error("Failed to mark refund_status=processing before Razorpay call", {
        appointmentId: appointment.id,
        paymentId,
        error: err instanceof Error ? err.message : String(err),
      });
      await alertOps({
        title: "Failed to mark refund_status=processing before Razorpay call",
        step: OPS_ALERT_STEP.REFUND,
        error: err,
        clinicId,
        extra: { appointmentId: appointment.id, paymentId },
      });
    }

    try {
      const refund = await this._razorpayClient.createRefund({
        paymentId,
        idempotencyKey: idempotencyKey ?? `appt_cancel_${appointment.id}`,
        notes: {
          appointment_id: appointment.id,
          clinic_id: clinicId,
          reason,
        },
      });
      const refundedAt = new Date().toISOString();
      try {
        await this._appointmentRepo.updateRefundFields(clinicId, appointment.id, {
          refundStatus: REFUND_STATUS.COMPLETED,
          refundId: refund.id,
          refundedAt,
          paymentStatus: "refunded",
        });
      } catch (err) {
        log.error("Razorpay refund succeeded but failed to persist refund fields", {
          appointmentId: appointment.id,
          paymentId,
          refundId: refund.id,
          error: err instanceof Error ? err.message : String(err),
        });
        await alertOps({
          title: "Razorpay refund succeeded but failed to persist refund fields",
          step: OPS_ALERT_STEP.REFUND,
          error: err,
          clinicId,
          extra: { appointmentId: appointment.id, paymentId, refundId: refund.id },
        });
      }
      log.info("Razorpay refund completed after cancel", {
        appointmentId: appointment.id,
        paymentId,
        refundId: refund.id,
        reason,
      });
      return {
        refundStatus: REFUND_STATUS.COMPLETED,
        refundInitiated: true,
        refundId: refund.id,
        refundedAt,
        paymentStatus: "refunded",
      };
    } catch (err) {
      log.error("Razorpay refund failed after cancel — cancellation still stands", {
        appointmentId: appointment.id,
        paymentId,
        reason,
        error: err instanceof Error ? err.message : String(err),
      });
      const enriched = enrichRefundFailureAlertFromError(
        err,
        "Razorpay refund failed after cancel — cancellation still stands",
      );
      await alertOps({
        title: enriched.title,
        step: OPS_ALERT_STEP.REFUND,
        error: err,
        clinicId,
        extra: {
          appointmentId: appointment.id,
          paymentId,
          reason,
          ...enriched.extraHint,
        },
      });
      try {
        await this._appointmentRepo.updateRefundFields(clinicId, appointment.id, {
          refundStatus: REFUND_STATUS.FAILED,
        });
      } catch (persistErr) {
        log.error("Failed to persist refund_status=failed after Razorpay error", {
          appointmentId: appointment.id,
          paymentId,
          error: persistErr instanceof Error ? persistErr.message : String(persistErr),
        });
        await alertOps({
          title: "Failed to persist refund_status=failed after Razorpay error",
          step: OPS_ALERT_STEP.REFUND,
          error: persistErr,
          clinicId,
          extra: { appointmentId: appointment.id, paymentId },
        });
      }
      if (throwOnFailure) throw err;
      return { refundStatus: REFUND_STATUS.FAILED, refundInitiated: false };
    }
  }

  /**
   * Refund + patient WhatsApp ack + in-app notify for an already-cancelled
   * appointment. Never rolls back the cancel.
   *
   * @param {{
   *   clinic: { id: string; whatsapp_phone_number_id?: string|null };
   *   appointment: object;
   *   log: import("../logger.js").Logger;
   *   reason: string;
   *   buildAckBody: (appointment: object, refundOutcome: object) => string;
   *   contactPhone?: string|null;
   *   contextLabel?: string;
   * }} params
   * @returns {Promise<object>} appointment with refund fields applied
   */
  async finalizeAfterCancel({
    clinic,
    appointment,
    log,
    reason,
    buildAckBody,
    contactPhone = null,
    contextLabel = "cancel",
  }) {
    const refundOutcome = await this.refundAfterCancel({
      clinicId: clinic.id,
      appointment,
      log,
      reason,
    });
    const appointmentForNotify = {
      ...appointment,
      refund_status: refundOutcome.refundStatus,
      refund_id: refundOutcome.refundId ?? appointment.refund_id ?? null,
      refunded_at: refundOutcome.refundedAt ?? appointment.refunded_at ?? null,
      payment_status: refundOutcome.paymentStatus ?? appointment.payment_status ?? null,
    };

    const toPhone = contactPhone ?? appointment.contact_phone ?? null;
    const phoneNumberId = clinic.whatsapp_phone_number_id ?? null;
    if (this._wa && phoneNumberId && toPhone) {
      const ackBody = buildAckBody(appointmentForNotify, refundOutcome);
      const maskedPhone = maskPhoneForLog(toPhone);
      const cancellationReason =
        reason ?? appointment.cancellation_reason ?? null;

      log.info("Sending patient cancel WhatsApp ack (plain text)", {
        appointmentId: appointment.id,
        patientPhoneMasked: maskedPhone,
        cancellationReason,
        contextLabel,
      });

      // Plain-text session messages require an open 24h customer-service
      // window. Outside it Meta rejects with 131047 and needs a template.
      const outsideSessionWindow = await this._isOutsideWhatsAppSessionWindow({
        clinicId: clinic.id,
        contactPhone: toPhone,
        log,
      });
      if (outsideSessionWindow) {
        log.warn(
          "Patient cancel ack is plain text but WhatsApp 24h session window appears closed — send will likely fail (Meta 131047); template required",
          {
            appointmentId: appointment.id,
            patientPhoneMasked: maskedPhone,
            cancellationReason,
            contextLabel,
            lastMessageAt: outsideSessionWindow.lastMessageAt,
          },
        );
      }

      try {
        await this._wa.sendText(phoneNumberId, toPhone, ackBody);
        log.info("Patient cancel WhatsApp ack sent", {
          appointmentId: appointment.id,
          patientPhoneMasked: maskedPhone,
          cancellationReason,
          contextLabel,
        });
      } catch (err) {
        const { metaErrorCode, metaErrorMessage, metaErrorType } =
          extractMetaSendError(err);
        const isSessionWindowError =
          Number(metaErrorCode) === META_SESSION_WINDOW_ERROR_CODE ||
          Boolean(outsideSessionWindow);

        if (isSessionWindowError) {
          log.error(
            "Patient cancel WhatsApp ack failed — outside 24h session window (plain text rejected; Meta requires a template)",
            {
              appointmentId: appointment.id,
              patientPhoneMasked: maskedPhone,
              cancellationReason,
              contextLabel,
              metaErrorCode: metaErrorCode ?? META_SESSION_WINDOW_ERROR_CODE,
              metaErrorMessage,
              metaErrorType,
              lastMessageAt: outsideSessionWindow?.lastMessageAt ?? null,
              error: err instanceof Error ? err.message : String(err),
              errorDetails: err?.details ?? null,
            },
          );
        } else {
          log.error(`Failed to send patient cancel WhatsApp ack after ${contextLabel}`, {
            appointmentId: appointment.id,
            patientPhoneMasked: maskedPhone,
            cancellationReason,
            contextLabel,
            metaErrorCode,
            metaErrorMessage,
            metaErrorType,
            error: err instanceof Error ? err.message : String(err),
            errorDetails: err?.details ?? null,
          });
        }

        await alertOps({
          title: isSessionWindowError
            ? "Patient cancel WhatsApp ack failed — outside 24h session window (template required)"
            : `Failed to send patient cancel WhatsApp ack after ${contextLabel}`,
          step: OPS_ALERT_STEP.WHATSAPP_SEND,
          error: err,
          clinicId: clinic.id,
          patientId: appointment.patient_id ?? null,
          contactPhone: maskedPhone,
          extra: {
            appointment_id: appointment.id,
            reason: cancellationReason,
            contextLabel,
            metaErrorCode: metaErrorCode ?? null,
            metaErrorMessage,
            sessionWindowClosed: Boolean(isSessionWindowError),
          },
        });
      }
    } else if (this._wa && toPhone && !phoneNumberId) {
      log.warn("Skipping patient cancel WhatsApp ack — clinic has no whatsapp_phone_number_id", {
        appointmentId: appointment.id,
        clinicId: clinic.id,
        cancellationReason: reason ?? appointment.cancellation_reason ?? null,
      });
    }

    if (this._inAppNotificationService) {
      try {
        await this._inAppNotificationService.createAppointmentCancelled({
          clinicId: clinic.id,
          appointment: appointmentForNotify,
        });
      } catch (err) {
        log.error(`Failed to create in-app cancel notification after ${contextLabel}`, {
          clinicId: clinic.id,
          appointmentId: appointment.id,
          error: err instanceof Error ? err.message : String(err),
        });
        await alertOps({
          title: `In-app cancel notification failed after ${contextLabel}`,
          step: OPS_ALERT_STEP.IN_APP_NOTIFICATION,
          error: err,
          clinicId: clinic.id,
          patientId: appointment.patient_id ?? null,
          extra: { appointmentId: appointment.id },
        });
      }
    }

    return appointmentForNotify;
  }

  /**
   * Best-effort check against conversation_state.last_message_at (patient's
   * last inbound). Returns null when the window looks open or we can't tell;
   * otherwise `{ lastMessageAt }` when outside the 24h session window.
   *
   * @param {{ clinicId: string; contactPhone: string; log: import("../logger.js").Logger }} params
   * @returns {Promise<{ lastMessageAt: string|null }|null>}
   */
  async _isOutsideWhatsAppSessionWindow({ clinicId, contactPhone, log }) {
    if (!this._conversationStateRepo?.find) return null;
    try {
      const row = await this._conversationStateRepo.find(clinicId, contactPhone);
      const lastMessageAt = row?.last_message_at ?? null;
      if (isConversationExpired(lastMessageAt)) {
        return { lastMessageAt };
      }
      return null;
    } catch (err) {
      log.warn("Could not read conversation_state for WhatsApp session-window check — proceeding with ack send", {
        clinicId,
        patientPhoneMasked: maskPhoneForLog(contactPhone),
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
