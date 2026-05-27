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

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken && token === verifyToken) {
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
    if (body.phone && body.message && body.clinicId) {
      return await handleMessage(body.phone, body.message, body.clinicId);
    }

    // Backward-compatible test format: { phone, message, doctorId }
    if (body.phone && body.message && body.doctorId) {
      const clinicId = await resolveClinicIdForDoctor(body.doctorId);
      return await handleMessage(body.phone, body.message, clinicId);
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

      // Map phone_number_id → clinic_id
      const clinicId = await resolveClinicId(phoneNumberId);

      if (!clinicId) {
        console.error(
          `[Webhook] No clinic found for phone_number_id: ${phoneNumberId}`
        );
        return NextResponse.json(
          { error: "Unknown phone_number_id" },
          { status: 200 }
        );
      }

      // Mark as read in WhatsApp
      markMessageRead(messageId, null, clinicId);

      return await handleMessage(phone, message, clinicId);
    }

    return NextResponse.json({ error: "Unknown payload format" }, { status: 400 });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleMessage(phone, message, clinicId) {
  const replies = await processMessage(phone, message, clinicId);

  for (const reply of replies) {
    await sendWhatsAppMessage(phone, reply, null, clinicId);
  }

  return NextResponse.json({ success: true, replies });
}

/**
 * Maps a Meta phone_number_id to a clinic id.
 * Looks up clinics.whatsapp_phone_number_id in the DB.
 * Falls back to the first clinic if only one exists.
 */
async function resolveClinicId(phoneNumberId) {
  const supabase = getSupabaseAdminClient();

  if (phoneNumberId) {
    const { data: match } = await supabase
      .from("clinics")
      .select("id")
      .eq("whatsapp_phone_number_id", phoneNumberId)
      .single();

    if (match) return match.id;
  }

  const { data: fallback } = await supabase
    .from("clinics")
    .select("id")
    .limit(1)
    .single();

  return fallback?.id || null;
}

async function resolveClinicIdForDoctor(doctorId) {
  if (!doctorId) return null;
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("doctor_profiles")
    .select("clinic_id")
    .eq("user_id", doctorId)
    .single();
  return data?.clinic_id || null;
}
