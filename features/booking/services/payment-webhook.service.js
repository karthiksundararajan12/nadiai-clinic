/**
 * @fileoverview PaymentWebhookService — business logic for the Razorpay
 * webhook (`/api/webhooks/razorpay`), handling PAYMENT_PENDING -> CONFIRMED
 * ("payment.captured") and PAYMENT_PENDING -> released ("payment.failed").
 *
 * Correlation: RazorpayClientService stamps `notes.appointment_id` /
 * `notes.clinic_id` on the Payment Link at creation time
 * (SlotSelectionService); Razorpay copies `notes` onto the resulting
 * Payment entity, so both events carry them back at
 * `payload.payment.entity.notes` — that's "the payment link's reference"
 * this handler looks appointments up by.
 *
 * Idempotency has two independent layers:
 *   1. Event-level: every `X-Razorpay-Event-Id` is recorded via
 *      RazorpayWebhookEventRepository before any side effect runs — a
 *      replay of the same event id is a pure no-op.
 *   2. Row-level: AppointmentRepository.confirmPayment/releaseFailedHold
 *      are single conditional UPDATEs (never read-then-write) scoped to
 *      `status = 'payment_pending'`, so even a webhook redelivered under a
 *      *different* event id (Razorpay's docs don't guarantee event ids are
 *      stable across retries of the same underlying delivery) can't
 *      double-apply a transition.
 *
 * Route handler contract: this service never throws for "business" outcomes
 * (missing correlation, late payment, nothing to release) — those are
 * logged and returned as a result object. It only throws for genuine
 * infrastructure failures (DB errors), which the route logs and still ACKs
 * 200 for, matching the WhatsApp webhook route's anti-retry-storm pattern.
 *
 * Out of scope (per spec): refunds, and an admin UI for reconciling
 * late/expired payments — logging is enough for now.
 */

import { CONVERSATION_STATE, RAZORPAY_EVENT_TYPE, PAYMENT_WEBHOOK_COPY } from "../constants.js";
import { assertValidConversationTransition } from "../lib/conversation-transitions.js";
import { formatSlotLabel } from "../lib/slot-engine.js";
import { createLogger } from "../logger.js";

export class PaymentWebhookService {
  /**
   * @param {import("../repository/appointment.repository.js").AppointmentRepository} appointmentRepo
   * @param {import("../repository/clinic.repository.js").ClinicRepository} clinicRepo
   * @param {import("../repository/conversation-state.repository.js").ConversationStateRepository} conversationRepo
   * @param {import("./whatsapp-client.service.js").WhatsAppClientService} whatsappClient
   * @param {import("../repository/razorpay-webhook-event.repository.js").RazorpayWebhookEventRepository} webhookEventRepo
   */
  constructor(appointmentRepo, clinicRepo, conversationRepo, whatsappClient, webhookEventRepo) {
    this._appointmentRepo = appointmentRepo;
    this._clinicRepo      = clinicRepo;
    this._conversationRepo = conversationRepo;
    this._wa               = whatsappClient;
    this._eventRepo        = webhookEventRepo;
    this._log = createLogger({ component: "PaymentWebhookService" });
  }

  /**
   * @param {{ eventId: string; eventType: string; payload: unknown }} params
   * @returns {Promise<{ handled: boolean; action: string; appointmentId?: string }>}
   */
  async handleEvent({ eventId, eventType, payload }) {
    const log = this._log.child({ razorpayEventId: eventId, razorpayEventType: eventType });

    const isNew = await this._eventRepo.recordIfNew(eventId, eventType, payload);
    if (!isNew) {
      return { handled: true, action: "DUPLICATE_EVENT_SKIPPED" };
    }

    switch (eventType) {
      case RAZORPAY_EVENT_TYPE.PAYMENT_CAPTURED:
        return this._handleCaptured({ payload, log });
      case RAZORPAY_EVENT_TYPE.PAYMENT_FAILED:
        return this._handleFailed({ payload, log });
      default:
        log.info("Ignoring unhandled Razorpay event type");
        return { handled: true, action: "IGNORED_EVENT_TYPE" };
    }
  }

  _extractPayment(payload) {
    return payload?.payload?.payment?.entity ?? null;
  }

  /** @returns {{ appointmentId: string; clinicId: string }|null} */
  _extractCorrelation(payment) {
    const appointmentId = payment?.notes?.appointment_id;
    const clinicId = payment?.notes?.clinic_id;
    if (!appointmentId || !clinicId) return null;
    return { appointmentId, clinicId };
  }

  async _handleCaptured({ payload, log }) {
    const payment = this._extractPayment(payload);
    const correlation = this._extractCorrelation(payment);

    if (!correlation) {
      log.error("payment.captured event missing appointment_id/clinic_id in notes — cannot correlate to an appointment", {
        razorpayPaymentId: payment?.id ?? null,
      });
      return { handled: true, action: "MISSING_CORRELATION" };
    }
    const { appointmentId, clinicId } = correlation;

    const confirmed = await this._appointmentRepo.confirmPayment(clinicId, appointmentId, payment.id);

    if (!confirmed) {
      const current = await this._appointmentRepo.findByIdForClinic(clinicId, appointmentId).catch(() => null);
      log.warn("Late/expired payment.captured — NOT auto-confirming, needs manual reconciliation", {
        appointmentId,
        clinicId,
        razorpayPaymentId: payment.id,
        currentStatus: current?.status ?? "NOT_FOUND",
        holdExpiresAt: current?.hold_expires_at ?? null,
      });
      return { handled: true, action: "LATE_PAYMENT_NOT_CONFIRMED", appointmentId };
    }

    log.info("Confirmed appointment from Razorpay payment.captured", {
      appointmentId,
      clinicId,
      razorpayPaymentId: payment.id,
    });

    await this._notifyContact({
      clinicId,
      contactPhone: confirmed.contact_phone,
      body: PAYMENT_WEBHOOK_COPY.PAYMENT_CONFIRMED.replace("{slotLabel}", formatSlotLabel(new Date(confirmed.slot_start))),
      log,
    });
    await this._advanceConversationState({
      clinicId,
      contactPhone: confirmed.contact_phone,
      targetState: CONVERSATION_STATE.CONFIRMED,
      log,
    });

    return { handled: true, action: "PAYMENT_CONFIRMED", appointmentId };
  }

  async _handleFailed({ payload, log }) {
    const payment = this._extractPayment(payload);
    const correlation = this._extractCorrelation(payment);

    if (!correlation) {
      log.error("payment.failed event missing appointment_id/clinic_id in notes — cannot correlate to an appointment", {
        razorpayPaymentId: payment?.id ?? null,
      });
      return { handled: true, action: "MISSING_CORRELATION" };
    }
    const { appointmentId, clinicId } = correlation;

    const released = await this._appointmentRepo.releaseFailedHold(clinicId, appointmentId);

    if (!released) {
      log.info("payment.failed for an appointment no longer PAYMENT_PENDING — nothing to release", {
        appointmentId,
        clinicId,
      });
      return { handled: true, action: "NOTHING_TO_RELEASE", appointmentId };
    }

    log.info("Released PAYMENT_PENDING hold after Razorpay payment.failed", { appointmentId, clinicId });

    await this._notifyContact({
      clinicId,
      contactPhone: released.contact_phone,
      body: PAYMENT_WEBHOOK_COPY.PAYMENT_FAILED,
      log,
    });
    await this._advanceConversationState({
      clinicId,
      contactPhone: released.contact_phone,
      targetState: CONVERSATION_STATE.START,
      log,
    });

    return { handled: true, action: "PAYMENT_FAILED_HOLD_RELEASED", appointmentId };
  }

  /**
   * Best-effort — a notification failure must not roll back the
   * confirm/release DB transition that already happened, same rationale as
   * DoctorNotificationService.
   */
  async _notifyContact({ clinicId, contactPhone, body, log }) {
    try {
      const clinic = await this._clinicRepo.findById(clinicId);
      if (!clinic?.whatsapp_phone_number_id) {
        log.warn("No whatsapp_phone_number_id on file for clinic — cannot notify contact", { clinicId });
        return;
      }
      await this._wa.sendText(clinic.whatsapp_phone_number_id, contactPhone, body);
    } catch (err) {
      log.error("Failed to send WhatsApp notification after payment webhook", {
        clinicId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * This webhook fires asynchronously, well after the inbound-message flow
   * that put the conversation into PAYMENT_PENDING — the contact may have
   * since sent "cancel" or otherwise moved on. Only advance the state if
   * it's still exactly where we left it; never force it, and never let a
   * failure here roll back the appointment-row transition that already
   * happened.
   */
  async _advanceConversationState({ clinicId, contactPhone, targetState, log }) {
    try {
      const row = await this._conversationRepo.find(clinicId, contactPhone);
      if (!row) {
        log.warn("No conversation_state row found to advance after payment webhook", { clinicId, contactPhone, targetState });
        return;
      }
      if (row.current_state !== CONVERSATION_STATE.PAYMENT_PENDING) {
        log.info("conversation_state has moved on since payment was initiated — leaving it untouched", {
          clinicId,
          contactPhone,
          currentState: row.current_state,
          targetState,
        });
        return;
      }
      assertValidConversationTransition(row.current_state, targetState);
      await this._conversationRepo.update(row.id, {
        current_state: targetState,
        retry_count: 0,
        last_message_at: new Date().toISOString(),
      });
    } catch (err) {
      log.error("Failed to advance conversation_state after payment webhook", {
        clinicId,
        contactPhone,
        targetState,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
