import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Binds a Meta phone_number_id to a clinic and clears send-cache for that clinic.
 */
export async function bindClinicPhoneNumberId(clinicId, phoneNumberId) {
  if (!clinicId || !phoneNumberId) return false;

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("clinics")
    .update({
      whatsapp_provider: "meta",
      whatsapp_phone_number_id: String(phoneNumberId),
      whatsapp_setup_status: "active",
      whatsapp_verified_at: new Date().toISOString(),
      whatsapp_setup_error: null,
    })
    .eq("id", clinicId);

  if (error) {
    console.error("[WhatsApp] Failed to bind clinic:", error.message);
    return false;
  }

  clearClinicPhoneNumberCache(clinicId);
  console.log(`[WhatsApp] Bound clinic ${clinicId} → phone_number_id ${phoneNumberId}`);
  return true;
}

/** Clears in-memory send cache after binding (utils.js registers this). */
let cacheClearFn = null;
export function registerPhoneNumberCacheClear(fn) {
  cacheClearFn = fn;
}
function clearClinicPhoneNumberCache(clinicId) {
  cacheClearFn?.(`clinic:${clinicId}`);
}

/**
 * Discovers WhatsApp Business Account id from the access token (one app token).
 */
async function discoverWhatsappBusinessAccountId(token) {
  try {
    const bizRes = await fetch(
      `${GRAPH_API_URL}/me/businesses?fields=id,name`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const bizJson = await bizRes.json();
    const businesses = bizJson.data || [];

    for (const biz of businesses) {
      const wabaRes = await fetch(
        `${GRAPH_API_URL}/${biz.id}/owned_whatsapp_business_accounts?fields=id`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const wabaJson = await wabaRes.json();
      const waba = wabaJson.data?.[0];
      if (waba?.id) return waba.id;
    }
  } catch (err) {
    console.warn("[WhatsApp] WABA discovery failed:", err.message);
  }
  return null;
}

async function resolveWhatsappBusinessAccountId(token) {
  if (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    return process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  }
  return discoverWhatsappBusinessAccountId(token);
}

/**
 * Fetches phone numbers from Meta and assigns the first unused number to
 * this clinic. Uses WHATSAPP_ACCESS_TOKEN; WABA id is env or auto-discovered.
 */
export async function syncClinicWhatsAppFromMeta(clinicId) {
  const token =
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.META_SYSTEM_USER_TOKEN ||
    null;

  if (!clinicId || !token) {
    return null;
  }

  const wabaId = await resolveWhatsappBusinessAccountId(token);
  if (!wabaId) {
    return null;
  }

  const supabase = getSupabaseAdminClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("whatsapp_phone_number_id")
    .eq("id", clinicId)
    .single();

  if (clinic?.whatsapp_phone_number_id) {
    return clinic.whatsapp_phone_number_id;
  }

  try {
    const res = await fetch(
      `${GRAPH_API_URL}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await res.json();

    if (!res.ok) {
      console.error("[WhatsApp] Meta phone_numbers error:", json);
      return null;
    }

    const numbers = json.data || [];
    if (numbers.length === 0) return null;

    const { data: allClinics } = await supabase
      .from("clinics")
      .select("whatsapp_phone_number_id");

    const used = new Set(
      (allClinics || [])
        .map((c) => c.whatsapp_phone_number_id)
        .filter(Boolean)
    );

    const available = numbers.filter((n) => !used.has(n.id));
    const pick = available[0] || (numbers.length === 1 ? numbers[0] : null);

    if (!pick?.id) {
      console.warn(
        "[WhatsApp] Multiple Meta numbers but none free; bind on first inbound message"
      );
      return null;
    }

    await bindClinicPhoneNumberId(clinicId, pick.id);
    return pick.id;
  } catch (err) {
    console.error("[WhatsApp] syncClinicWhatsAppFromMeta:", err);
    return null;
  }
}

/**
 * Resolves clinic for an inbound Meta webhook.
 * Production routing must be explicit by Meta phone_number_id.
 */
export async function resolveClinicForIncomingMessage(phoneNumberId) {
  if (!phoneNumberId) return null;

  const supabase = getSupabaseAdminClient();

  const { data: matched } = await supabase
    .from("clinics")
    .select("id")
    .eq("whatsapp_phone_number_id", String(phoneNumberId))
    .maybeSingle();

  if (matched?.id) return matched.id;

  return null;
}
