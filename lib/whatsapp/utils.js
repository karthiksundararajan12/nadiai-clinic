import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { registerPhoneNumberCacheClear } from "@/lib/whatsapp/clinic-whatsapp";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

let phoneNumberIdCache = {};

registerPhoneNumberCacheClear((cacheKey) => {
  delete phoneNumberIdCache[cacheKey];
});

/**
 * Looks up Meta phone_number_id for sending WhatsApp messages.
 * For multi-doctor clinics, this is derived from clinics.whatsapp_phone_number_id.
 * Falls back to doctor_profiles.whatsapp_phone_number_id for backward compatibility.
 *
 * Cached per key in-memory for the lifetime of the process.
 */
async function getPhoneNumberId({ doctorId, clinicId }) {
  const cacheKey = clinicId ? `clinic:${clinicId}` : doctorId ? `doctor:${doctorId}` : null;
  if (!cacheKey) return null;
  if (phoneNumberIdCache[cacheKey]) return phoneNumberIdCache[cacheKey];

  const supabase = getSupabaseAdminClient();

  if (clinicId) {
    const { data } = await supabase
      .from("clinics")
      .select("whatsapp_phone_number_id")
      .eq("id", clinicId)
      .single();
    const id = data?.whatsapp_phone_number_id || null;
    if (id) phoneNumberIdCache[cacheKey] = id;
    return id;
  }

  if (!doctorId) return null;
  const { data } = await supabase
    .from("doctor_profiles")
    .select("whatsapp_phone_number_id")
    .eq("user_id", doctorId)
    .single();

  const id = data?.whatsapp_phone_number_id || null;
  if (id) phoneNumberIdCache[cacheKey] = id;
  return id;
}

/**
 * Sends a WhatsApp message via Meta Cloud API.
 * Looks up the doctor's phone_number_id from the database.
 * Falls back to console.log if credentials are not configured.
 */
export async function sendWhatsAppMessage(phone, message, doctorId, clinicId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = await getPhoneNumberId({ doctorId, clinicId });

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
export async function markMessageRead(messageId, doctorId, clinicId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = await getPhoneNumberId({ doctorId, clinicId });

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
