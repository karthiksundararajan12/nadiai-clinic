/**
 * GET  /api/whatsapp/webhook  — Meta Cloud API subscription verification (hub challenge)
 * POST /api/whatsapp/webhook  — inbound WhatsApp messages
 *
 * No user session here — this is a server-to-server webhook from Meta.
 * Multi-tenant routing: every request resolves phone_number_id → clinic_id
 * exactly once (via ClinicRepository), then threads clinic_id through
 * every downstream query. See features/booking/index.js for scope notes.
 *
 * ── Top-level error boundary (pre-pilot visibility pass) ────────────────
 * Two independent boundaries, both alert ops (index.js header note #29)
 * instead of only logging, and both still ACK Meta with 200 (unchanged —
 * avoids a retry storm, see the per-message catch below):
 *   1. Per-message (existing): a failure processing ONE inbound message
 *      now also sends that one patient a graceful fallback reply
 *      (WHATSAPP_FALLBACK_REPLY) via message.phoneNumberId — the Meta
 *      business number id, always known even when clinic lookup itself
 *      failed — instead of leaving them with silence.
 *   2. Whole-request (new): anything thrown before/around the per-message
 *      loop (e.g. createBookingServices() failing on missing credentials,
 *      a parser bug) is now caught here too, alerted, and still ACKs 200.
 *      No fallback reply is attempted at this level — with no successfully
 *      parsed message, there is no reliable (phoneNumberId, contactPhone)
 *      pair to reply to.
 */

import { NextResponse } from "next/server";
import {
  createBookingServices,
  verifyMetaSignature,
  parseInboundWhatsAppWebhook,
  NormalizedInboundMessageSchema,
  parseReminderReplyId,
  bookingLogger,
  alertOps,
  OPS_ALERT_STEP,
} from "@/features/booking";

const log = bookingLogger.child({ component: "API /api/whatsapp/webhook" });

const WHATSAPP_FALLBACK_REPLY =
  "Sorry, something went wrong on our end. Our team has been notified and will follow up with you shortly.";

// ─────────────────────────────────────────────────────────────
// GET — subscription verification
// ─────────────────────────────────────────────────────────────

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && expectedToken && token === expectedToken) {
    log.info("Webhook verification succeeded");
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  log.warn("Webhook verification failed", { mode, tokenMatched: token === expectedToken });
  return new NextResponse("Forbidden", { status: 403 });
}

// ─────────────────────────────────────────────────────────────
// POST — inbound messages
// ─────────────────────────────────────────────────────────────

export async function POST(request) {
  const rawBody = await request.text();

  const signatureHeader = request.headers.get("x-hub-signature-256");
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!verifyMetaSignature(rawBody, signatureHeader, appSecret)) {
    // Diagnostic flags only -- never log the secret or signature values themselves.
    log.warn("Rejected webhook POST with invalid signature", {
      hasAppSecretConfigured: Boolean(appSecret),
      hasSignatureHeader: Boolean(signatureHeader),
      signatureHeaderPrefixOk: signatureHeader?.startsWith("sha256=") ?? false,
    });
    return NextResponse.json({ error: "Invalid signature", code: "WEBHOOK_SIGNATURE_INVALID" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log.warn("Rejected webhook POST with malformed JSON body");
    return NextResponse.json({ error: "Malformed JSON body", code: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const messages = parseInboundWhatsAppWebhook(payload);
    if (messages.length === 0) {
      // Delivery/read receipts or other non-message callbacks — nothing to do.
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    const { clinicRepository, conversationStateService, reminderService, whatsappClient } = createBookingServices();

    for (const rawMessage of messages) {
      const parsed = NormalizedInboundMessageSchema.safeParse(rawMessage);
      if (!parsed.success) {
        log.error("Dropping malformed normalized message", { issues: parsed.error.flatten() });
        continue;
      }
      const message = parsed.data;
      const messageLog = log.child({ waMessageId: message.waMessageId });

      let clinicIdForAlert = null;
      try {
        const clinic = await clinicRepository.findByWhatsAppPhoneNumberId(message.phoneNumberId);
        if (!clinic) {
          messageLog.warn("No clinic registered for phone_number_id — dropping message", {
            phoneNumberId: message.phoneNumberId,
          });
          continue;
        }
        clinicIdForAlert = clinic.id;

        // Reminder quick-replies (Confirm/Cancel/Reschedule) self-identify their
        // target appointment via the button payload (lib/reminder-reply.js) and
        // are routed here BEFORE conversationStateService. Confirm/Cancel stay
        // appointment-scoped; Reschedule may upsert conversation_state into
        // SLOT_SELECTION for self-serve slot picking on the same appointment.
        const reminderReply = parseReminderReplyId(message.replyId);
        const result = reminderReply
          ? await reminderService.handleQuickReply({ clinic, message })
          : await conversationStateService.processInboundMessage({ clinic, message });
        messageLog.info("Inbound message processed", { clinicId: clinic.id, ...result });
      } catch (err) {
        // Always ACK Meta with 200 below — we don't want processing failures to
        // trigger Meta's webhook retry storm. Errors are logged AND alerted
        // (index.js header note #29), and the patient gets a graceful
        // fallback reply instead of silence.
        messageLog.error("Failed to process inbound message", {
          error: err instanceof Error ? err.message : String(err),
        });
        await alertOps({
          title: "Failed to process inbound WhatsApp message",
          step: OPS_ALERT_STEP.WHATSAPP_WEBHOOK_MESSAGE,
          error: err,
          clinicId: clinicIdForAlert,
          contactPhone: message.contactPhone,
          extra: { waMessageId: message.waMessageId },
        });

        try {
          await whatsappClient.sendText(message.phoneNumberId, message.contactPhone, WHATSAPP_FALLBACK_REPLY);
        } catch (replyErr) {
          messageLog.error("Failed to send graceful fallback reply after processing error", {
            error: replyErr instanceof Error ? replyErr.message : String(replyErr),
          });
          await alertOps({
            title: "Failed to send graceful fallback reply to patient after a webhook processing error",
            step: OPS_ALERT_STEP.WHATSAPP_WEBHOOK_FALLBACK_REPLY_FAILED,
            error: replyErr,
            clinicId: clinicIdForAlert,
            contactPhone: message.contactPhone,
            extra: { waMessageId: message.waMessageId },
          });
        }
      }
    }

    return NextResponse.json({ status: "processed", count: messages.length }, { status: 200 });
  } catch (err) {
    // Whole-request boundary — anything thrown before/around the
    // per-message loop above (e.g. createBookingServices() failing on
    // missing credentials, a parser bug). Still ACKs Meta 200 for the same
    // anti-retry-storm reason as the per-message catch; no fallback reply
    // is attempted here since no message was successfully parsed.
    log.error("Unhandled error in WhatsApp webhook POST handler", {
      error: err instanceof Error ? err.message : String(err),
    });
    await alertOps({
      title: "Unhandled error in WhatsApp webhook POST handler",
      step: OPS_ALERT_STEP.WHATSAPP_WEBHOOK_TOP_LEVEL,
      error: err,
    });
    return NextResponse.json({ status: "error_handled" }, { status: 200 });
  }
}
