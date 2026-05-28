export const WHATSAPP_SETUP_STATUS = {
  NOT_STARTED: "not_started",
  SIGNUP_STARTED: "signup_started",
  PENDING_VERIFICATION: "pending_verification",
  ACTIVE: "active",
  FAILED: "failed",
};

export function normalizeIndianPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";

  const normalized = digits.length > 10 ? digits : `91${digits}`;
  return `+${normalized}`;
}

export function parsePhoneForMeta(value) {
  const normalized = normalizeIndianPhoneNumber(value);
  const digits = normalized.replace(/\D/g, "");

  if (!digits) return null;

  return {
    display: normalized,
    cc: digits.length > 10 ? digits.slice(0, digits.length - 10) : "91",
    phoneNumber: digits.length > 10 ? digits.slice(-10) : digits,
  };
}

export function buildMetaWebhookUrl(origin) {
  if (!origin) return null;
  return `${origin.replace(/\/$/, "")}/api/whatsapp/webhook`;
}
