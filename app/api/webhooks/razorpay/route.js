/**
 * POST /api/webhooks/razorpay — Razorpay payment webhook.
 *
 * No user session here — this is a server-to-server webhook from Razorpay,
 * same shape as the WhatsApp webhook (app/api/whatsapp/webhook/route.js):
 * verify signature over the raw body, then always ACK 200 (even on internal
 * errors, which are logged, not surfaced) so a transient failure on our end
 * doesn't trigger a Razorpay retry storm — see PaymentWebhookService's
 * header comment on why that's safe (it's fully idempotent).
 *
 * Requires RAZORPAY_WEBHOOK_SECRET (dashboard-configured, distinct from
 * RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET used to create payment links).
 */

import { NextResponse } from "next/server";
import {
  createBookingServices,
  verifyRazorpaySignature,
  bookingLogger,
} from "@/features/booking";

const log = bookingLogger.child({ component: "API /api/webhooks/razorpay" });

export async function POST(request) {
  const rawBody = await request.text();

  const signatureHeader = request.headers.get("x-razorpay-signature");
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!verifyRazorpaySignature(rawBody, signatureHeader, webhookSecret)) {
    log.warn("Rejected Razorpay webhook POST with invalid signature");
    return NextResponse.json(
      { error: "Invalid signature", code: "RAZORPAY_WEBHOOK_SIGNATURE_INVALID" },
      { status: 401 },
    );
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    log.warn("Rejected Razorpay webhook POST with malformed JSON body");
    return NextResponse.json({ error: "Malformed JSON body", code: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const eventId = request.headers.get("x-razorpay-event-id");
  const eventType = body?.event;

  if (!eventId || !eventType) {
    log.warn("Razorpay webhook missing X-Razorpay-Event-Id header or body.event — dropping", { eventId, eventType });
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  }

  const eventLog = log.child({ razorpayEventId: eventId, razorpayEventType: eventType });
  const { paymentWebhookService } = createBookingServices();

  try {
    const result = await paymentWebhookService.handleEvent({ eventId, eventType, payload: body });
    eventLog.info("Processed Razorpay webhook event", result);
  } catch (err) {
    eventLog.error("Failed to process Razorpay webhook event", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ status: "processed" }, { status: 200 });
}
