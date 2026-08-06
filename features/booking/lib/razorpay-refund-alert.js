/**
 * @fileoverview Helpers for Razorpay refund failure ops alerts.
 *
 * Test-mode accounts often return a generic HTTP 400 "invalid request sent"
 * when the merchant balance cannot fund a refund. Surface that likely cause
 * in ops_alerts so we do not re-investigate every time in test/dev.
 */

export const RAZORPAY_TEST_MODE_INSUFFICIENT_BALANCE_HINT =
  "likely test-mode insufficient balance — check Razorpay dashboard";

/**
 * @param {string|null|undefined} keyId
 * @returns {boolean}
 */
export function isRazorpayTestModeKey(keyId) {
  return typeof keyId === "string" && keyId.startsWith("rzp_test_");
}

/**
 * @param {{
 *   keyId: string|null|undefined;
 *   status: number;
 *   errorPayload?: { description?: string; code?: string }|null;
 *   paymentId: string;
 *   appointmentId?: string|null;
 * }} opts
 * @returns {{
 *   title: string;
 *   description: string;
 *   hint: string|null;
 *   extra: Record<string, unknown>;
 * }}
 */
export function buildRefundApiFailureAlert({
  keyId,
  status,
  errorPayload = null,
  paymentId,
  appointmentId = null,
}) {
  const description =
    (typeof errorPayload?.description === "string" && errorPayload.description) ||
    `Razorpay refund API responded with ${status}`;

  const isTestMode = isRazorpayTestModeKey(keyId);
  const looksLikeInvalidRequest =
    status === 400 && description.trim().toLowerCase() === "invalid request sent";
  const hint =
    isTestMode && looksLikeInvalidRequest
      ? RAZORPAY_TEST_MODE_INSUFFICIENT_BALANCE_HINT
      : null;

  return {
    title: hint
      ? `Razorpay refund failed (API error) — ${hint}`
      : "Razorpay refund failed (API error)",
    description,
    hint,
    extra: {
      paymentId,
      appointmentId,
      status,
      ...(hint
        ? { hint, razorpayTestMode: true }
        : isTestMode
          ? { razorpayTestMode: true }
          : {}),
      ...(typeof errorPayload?.code === "string"
        ? { razorpayErrorCode: errorPayload.code }
        : {}),
    },
  };
}

/**
 * Enrich the secondary post-cancel refund alert title when RazorpaySendError
 * already carries a test-mode hint in `details`.
 *
 * @param {unknown} err
 * @param {string} baseTitle
 * @returns {{ title: string; hint: string|null; extraHint: Record<string, unknown> }}
 */
export function enrichRefundFailureAlertFromError(err, baseTitle) {
  const details = err && typeof err === "object" ? err.details : null;
  const hint =
    details && typeof details === "object" && typeof details.hint === "string"
      ? details.hint
      : null;
  return {
    title: hint ? `${baseTitle} (${hint})` : baseTitle,
    hint,
    extraHint: hint ? { hint, razorpayTestMode: details?.razorpayTestMode === true } : {},
  };
}
