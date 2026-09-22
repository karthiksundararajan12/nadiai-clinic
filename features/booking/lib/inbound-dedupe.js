/**
 * @fileoverview Inbound WhatsApp webhook idempotency claim.
 *
 * Meta redelivers an inbound message webhook on anything but a prompt 2xx,
 * and occasionally redelivers regardless. Without a claim, a redelivery
 * re-runs the message's side effects: re-sending the CONFIRMED fallback
 * reply, or re-applying a reset keyword and wiping conversation_state back
 * to START — both of which read to the patient as the bot messaging them
 * spontaneously, minutes or hours after they last typed anything.
 *
 * Lives here rather than in the route module so it can be unit-tested
 * without the `@/` path alias — see test/inbound-dedupe.test.js.
 */

import { alertOps, OPS_ALERT_STEP } from "./alerting.js";

/**
 * Records this delivery's wamid, returning whether the caller should go on
 * to process it. Must be called BEFORE any side effect, and before routing
 * to reminderService vs conversationStateService, so both branches are
 * covered — reminder quick-replies never touched conversation_state and so
 * had no dedupe of their own at all.
 *
 * Fails OPEN: if the ledger itself is unreachable we process the message
 * and accept a possible duplicate reply, rather than going mute on the
 * patient. That is the opposite of the money-handling ledgers
 * (razorpay_webhook_events), where a replay is worse than a dropped one.
 *
 * @param {import("../repository/whatsapp-inbound-message.repository.js").WhatsAppInboundMessageRepository} repository
 * @param {import("./webhook-parser.js").NormalizedInboundMessage} message
 * @param {import("../logger.js").Logger} log
 * @returns {Promise<boolean>} true when this wamid has not been seen before.
 */
export async function claimInboundMessage(repository, message, log) {
  try {
    const isNew = await repository.recordIfNew(message.waMessageId, {
      phoneNumberId: message.phoneNumberId,
      contactPhone: message.contactPhone,
    });
    if (!isNew) {
      log.info("Duplicate inbound webhook delivery — skipping re-processing", {
        contactPhone: message.contactPhone,
      });
    }
    return isNew;
  } catch (err) {
    log.error("Inbound message dedupe ledger unavailable — processing anyway", {
      error: err instanceof Error ? err.message : String(err),
    });
    await alertOps({
      title: "Inbound WhatsApp dedupe ledger unavailable — message processed without idempotency",
      step: OPS_ALERT_STEP.WHATSAPP_WEBHOOK_DEDUPE_UNAVAILABLE,
      error: err,
      contactPhone: message.contactPhone,
      extra: { waMessageId: message.waMessageId },
    });
    return true;
  }
}
