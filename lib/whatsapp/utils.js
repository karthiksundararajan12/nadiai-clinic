import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

let phoneNumberIdCache = {};

/**
 * Looks up the doctor's whatsapp_phone_number_id from the database.
 * Caches per doctorId to avoid repeated DB calls within the same request.
 */
async function getPhoneNumberId(doctorId) {
  if (!doctorId) return null;
  if (phoneNumberIdCache[doctorId]) return phoneNumberIdCache[doctorId];

  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("doctor_profiles")
    .select("whatsapp_phone_number_id")
    .eq("user_id", doctorId)
    .single();

  const id = data?.whatsapp_phone_number_id || null;
  if (id) phoneNumberIdCache[doctorId] = id;
  return id;
}

/**
 * Sends a WhatsApp message via Meta Cloud API.
 * Looks up the doctor's phone_number_id from the database.
 * Falls back to console.log if credentials are not configured.
 */
export async function sendWhatsAppMessage(phone, message, doctorId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = await getPhoneNumberId(doctorId);

  if (!token || !phoneNumberId) {
    console.log(`[WhatsApp STUB → ${phone}] ${message}`);
    return { success: true, phone, message, stub: true };
  }

  const recipientPhone = phone.replace(/[^0-9]/g, "");

  try {
    const res = await fetch(
      `${GRAPH_API_URL}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipientPhone,
          type: "text",
          text: { preview_url: true, body: message },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("[WhatsApp Send Error]", data);
      return { success: false, error: data };
    }

    console.log(`[WhatsApp → ${phone}] Sent OK, id: ${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    console.error("[WhatsApp Send Error]", err);
    return { success: false, error: err.message };
  }
}

/**
 * Marks an incoming message as "read" in WhatsApp.
 */
export async function markMessageRead(messageId, doctorId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = await getPhoneNumberId(doctorId);

  if (!token || !phoneNumberId || !messageId) return;

  try {
    await fetch(`${GRAPH_API_URL}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
  } catch {
    // non-critical
  }
}

export function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatTime(time) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function generateInvoiceNumber() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
  return `INV-${y}${m}${d}-${seq}`;
}
