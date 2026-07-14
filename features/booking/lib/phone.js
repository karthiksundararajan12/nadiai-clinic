/**
 * @fileoverview Minimal phone normalization for outbound WhatsApp sends (no I/O).
 *
 * Meta's Cloud API expects the `to` field as digits only (E.164 without the
 * leading '+'), matching the format WhatsApp already uses for inbound
 * `messages[].from` values. `doctor_profiles.phone` is free-text and may
 * contain spaces, dashes, parentheses, or a leading '+' — this strips all
 * of that down to digits. It does NOT validate country code correctness;
 * it's a defensive normalization, not a phone validation library.
 */

/**
 * @param {string|null|undefined} rawPhone
 * @returns {string|null} digits-only phone, or null if nothing usable remains
 */
export function normalizePhoneForWhatsApp(rawPhone) {
  if (!rawPhone) return null;
  const digitsOnly = String(rawPhone).replace(/\D/g, "");
  return digitsOnly.length > 0 ? digitsOnly : null;
}

/**
 * Formats a stored contact phone for UI display (e.g. `919840227132` →
 * `+91 9840227132`). Pilot clinics are India-based; other country codes fall
 * back to `+{digits}` without inserting a space.
 *
 * @param {string|null|undefined} rawPhone
 * @returns {string}
 */
export function formatPhoneForDisplay(rawPhone) {
  const digits = normalizePhoneForWhatsApp(rawPhone);
  if (!digits) return rawPhone ?? "";
  if (digits.startsWith("91") && digits.length === 12) {
    return `+91 ${digits.slice(2)}`;
  }
  return `+${digits}`;
}
