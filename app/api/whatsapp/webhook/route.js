import { NextResponse } from "next/server";
import { processMessage } from "@/lib/whatsapp/bot-engine";
import { sendWhatsAppMessage, markMessageRead } from "@/lib/whatsapp/utils";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * GET — Meta webhook verification handshake.
 * Meta sends: hub.mode=subscribe, hub.verify_token=<your_token>, hub.challenge=<random_string>
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "nadi-ai-webhook-verify-2026";

  console.log("[Webhook Verify]", { mode, tokenMatch: token === verifyToken, hasChallenge: !!challenge });

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Verification failed", { status: 403 });
}

/**
 * POST — Receives incoming WhatsApp messages from Meta Cloud API.
 *
 * Meta webhook payload:
 * {
 *   "object": "whatsapp_business_account",
 *   "entry": [{
 *     "changes": [{
 *       "value": {
 *         "messaging_product": "whatsapp",
 *         "metadata": { "phone_number_id": "...", "display_phone_number": "..." },
 *         "messages": [{ "from": "91...", "type": "text", "text": { "body": "..." }, "id": "wamid..." }]
 *       }
 *     }]
 *   }]
 * }
 *
 * Also supports simple JSON for local testing:
 * { "phone": "+91...", "message": "Hello", "doctorId": "uuid" }
 */
export async function POST(request) {
  try {
    const body = await request.json();

    // Simple test format
    if (body.phone && body.message && body.doctorId) {
      return await handleMessage(body.phone, body.message, body.doctorId, null);
    }

    // Meta WhatsApp Cloud API format
    if (body.object === "whatsapp_business_account" || body.entry) {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      if (!value?.messages || value.messages.length === 0) {
        // Status update (delivered, read, etc.) — acknowledge
        return NextResponse.json({ status: "ok" }, { status: 200 });
      }

      const phoneNumberId = value.metadata?.phone_number_id;
      const msg = value.messages[0];

      if (msg.type !== "text") {
        // Only handle text messages for now
        return NextResponse.json({ status: "non_text_ignored" }, { status: 200 });
      }

      const phone = msg.from;
      const message = msg.text?.body || "";
      const messageId = msg.id;

      // Map phone_number_id → doctor_id
      const doctorId = await resolveDoctorId(phoneNumberId);

      if (!doctorId) {
        console.error(`[Webhook] No doctor found for phone_number_id: ${phoneNumberId}`);
        return NextResponse.json({ error: "Unknown phone_number_id" }, { status: 200 });
      }

      // Mark as read in WhatsApp
      markMessageRead(messageId, doctorId);

      return await handleMessage(phone, message, doctorId);
    }

    return NextResponse.json({ error: "Unknown payload format" }, { status: 400 });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleMessage(phone, message, doctorId) {
  const replies = await processMessage(phone, message, doctorId);

  for (const reply of replies) {
    await sendWhatsAppMessage(phone, reply, doctorId);
  }

  return NextResponse.json({ success: true, replies });
}

/**
 * Maps a Meta phone_number_id to a doctor's Supabase user ID.
 * Looks up doctor_profiles.whatsapp_phone_number_id in the DB.
 * Falls back to the first doctor if only one exists (single-doctor clinic).
 */
async function resolveDoctorId(phoneNumberId) {
  const supabase = getSupabaseAdminClient();

  if (phoneNumberId) {
    const { data: match } = await supabase
      .from("doctor_profiles")
      .select("user_id")
      .eq("whatsapp_phone_number_id", phoneNumberId)
      .single();

    if (match) return match.user_id;
  }

  const { data: fallback } = await supabase
    .from("doctor_profiles")
    .select("user_id")
    .limit(1)
    .single();

  return fallback?.user_id || null;
}
