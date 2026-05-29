const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export async function exchangeEmbeddedSignupCode(code) {
  if (!code || !process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    code,
  });

  const res = await fetch(`${GRAPH_API_URL}/oauth/access_token?${params}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || "Failed to exchange Meta code");
  }

  return data.access_token || null;
}

export function getMetaAccessToken(customerToken) {
  return (
    customerToken ||
    process.env.META_SYSTEM_USER_TOKEN ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    null
  );
}

export async function addPhoneNumberToWaba(
  wabaId,
  token,
  phone,
  verifiedName,
  options = {}
) {
  if (!wabaId || !token || !phone?.phoneNumber || !verifiedName) {
    return {
      success: false,
      error: "Missing WABA id, token, phone number, or verified name",
    };
  }

  const res = await fetch(`${GRAPH_API_URL}/${wabaId}/phone_numbers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cc: phone.cc,
      phone_number: phone.phoneNumber,
      verified_name: verifiedName,
      ...(options.migrate ? { migrate_phone_number: true } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));

  if (res.ok && data.id) {
    return { success: true, phoneNumberId: data.id };
  }

  // Meta returns error code 100 when the number is already registered under
  // this WABA. Recover gracefully by fetching the existing phone_number_id.
  const errorCode = data?.error?.code;
  const errorMsg = data?.error?.message || "";
  const alreadyExists =
    errorCode === 100 ||
    errorMsg.toLowerCase().includes("already") ||
    errorMsg.toLowerCase().includes("exists");

  if (alreadyExists) {
    const existing = await getPhoneNumberIdFromWaba(wabaId, token, phone);
    if (existing) {
      return { success: true, phoneNumberId: existing, alreadyExisted: true };
    }
  }

  const userMsg = data?.error?.error_user_msg || data?.error?.error_user_title;
  return {
    success: false,
    error:
      userMsg ||
      data.error?.message ||
      "Failed to add WhatsApp phone number",
    details: data,
  };
}

/**
 * Looks up the phone_number_id for a given E.164 number already in the WABA.
 */
async function getPhoneNumberIdFromWaba(wabaId, token, phone) {
  try {
    const res = await fetch(
      `${GRAPH_API_URL}/${wabaId}/phone_numbers?fields=id,display_phone_number`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.data)) return null;

    const fullNumber = `${phone.cc}${phone.phoneNumber}`;
    const match = data.data.find((p) => {
      const digits = (p.display_phone_number || "").replace(/\D/g, "");
      return digits === fullNumber || digits.endsWith(phone.phoneNumber);
    });
    return match?.id || null;
  } catch {
    return null;
  }
}

export async function subscribeWabaToWebhooks(wabaId, token) {
  if (!wabaId || !token) {
    return { success: false, error: "Missing WABA id or Meta access token" };
  }

  const res = await fetch(`${GRAPH_API_URL}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    return {
      success: false,
      error: data.error?.message || "Failed to subscribe WABA webhooks",
      details: data,
    };
  }

  return { success: true };
}

export async function registerPhoneNumber(phoneNumberId, token) {
  const pin = process.env.META_PHONE_NUMBER_PIN;

  if (!phoneNumberId || !token || !pin) {
    return { skipped: true, reason: "META_PHONE_NUMBER_PIN not configured" };
  }

  // Meta requires the PIN to be exactly 6 numeric digits.
  // Reject placeholder values like "6_digit_pin_for_registered_numbers".
  if (!/^\d{6}$/.test(pin)) {
    return {
      skipped: true,
      reason:
        "META_PHONE_NUMBER_PIN must be exactly 6 numeric digits (e.g. 847362). Update it in your environment variables.",
    };
  }

  const res = await fetch(`${GRAPH_API_URL}/${phoneNumberId}/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      pin,
    }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    return {
      success: false,
      error:
        data.error?.error_user_msg ||
        data.error?.message ||
        "Failed to register WhatsApp phone number",
      details: data,
    };
  }

  return { success: true };
}

export async function requestPhoneVerificationCode(
  phoneNumberId,
  token,
  method = "SMS"
) {
  if (!phoneNumberId || !token) {
    return { success: false, error: "Missing phone number id or token" };
  }

  const res = await fetch(`${GRAPH_API_URL}/${phoneNumberId}/request_code`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code_method: method,
      language: "en",
    }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    return {
      success: false,
      error: data.error?.message || "Failed to request WhatsApp OTP",
      details: data,
    };
  }

  return { success: true };
}

export async function verifyPhoneVerificationCode(phoneNumberId, token, code) {
  if (!phoneNumberId || !token || !code) {
    return { skipped: true };
  }

  const res = await fetch(`${GRAPH_API_URL}/${phoneNumberId}/verify_code`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    return {
      success: false,
      error: data.error?.message || "Failed to verify WhatsApp OTP",
      details: data,
    };
  }

  return { success: true };
}

export async function getPhoneNumberDetails(phoneNumberId, token) {
  if (!phoneNumberId || !token) return null;

  const res = await fetch(
    `${GRAPH_API_URL}/${phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return null;
  }

  return data;
}
