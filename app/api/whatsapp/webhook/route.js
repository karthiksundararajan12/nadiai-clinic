/**
 * GET  /api/whatsapp/webhook  — Meta Cloud API subscription verification (hub challenge)
 * POST /api/whatsapp/webhook  — inbound WhatsApp messages
 *
 * No user session here — this is a server-to-server webhook from Meta.
 * Multi-tenant routing: every request resolves phone_number_id → clinic_id
 * exactly once (via ClinicRepository), then threads clinic_id through
 * every downstream query. See features/booking/index.js for scope notes.
 */

import { NextResponse } from "next/server";
import {
  createBookingServices,
  verifyMetaSignature,
  parseInboundWhatsAppWebhook,
  NormalizedInboundMessageSchema,
  parseReminderReplyId,
  bookingLogger,
} from "@/features/booking";

const log = bookingLogger.child({ component: "API /api/whatsapp/webhook" });

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

  const messages = parseInboundWhatsAppWebhook(payload);
  if (messages.length === 0) {
    // Delivery/read receipts or other non-message callbacks — nothing to do.
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  }

  const { clinicRepository, conversationStateService, reminderService } = createBookingServices();

  for (const rawMessage of messages) {
    const parsed = NormalizedInboundMessageSchema.safeParse(rawMessage);
    if (!parsed.success) {
      log.error("Dropping malformed normalized message", { issues: parsed.error.flatten() });
      continue;
    }
    const message = parsed.data;
    const messageLog = log.child({ waMessageId: message.waMessageId });

    try {
      const clinic = await clinicRepository.findByWhatsAppPhoneNumberId(message.phoneNumberId);
      if (!clinic) {
        messageLog.warn("No clinic registered for phone_number_id — dropping message", {
          phoneNumberId: message.phoneNumberId,
        });
        continue;
      }

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
      // trigger Meta's webhook retry storm. Errors are logged, not surfaced.
      messageLog.error("Failed to process inbound message", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ status: "processed", count: messages.length }, { status: 200 });
}
