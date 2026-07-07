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
