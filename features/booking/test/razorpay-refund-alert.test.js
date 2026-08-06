import test from "node:test";
import assert from "node:assert/strict";
import {
  RAZORPAY_TEST_MODE_INSUFFICIENT_BALANCE_HINT,
  buildRefundApiFailureAlert,
  enrichRefundFailureAlertFromError,
  isRazorpayTestModeKey,
} from "../lib/razorpay-refund-alert.js";
import { RazorpaySendError } from "../errors.js";

test("isRazorpayTestModeKey: true only for rzp_test_ prefix", () => {
  assert.equal(isRazorpayTestModeKey("rzp_test_abc"), true);
  assert.equal(isRazorpayTestModeKey("rzp_live_abc"), false);
  assert.equal(isRazorpayTestModeKey(null), false);
  assert.equal(isRazorpayTestModeKey(""), false);
});

test("buildRefundApiFailureAlert: test-mode 400 invalid request includes balance hint", () => {
  const alert = buildRefundApiFailureAlert({
    keyId: "rzp_test_ABC",
    status: 400,
    errorPayload: { description: "invalid request sent", code: "BAD_REQUEST_ERROR" },
    paymentId: "pay_1",
    appointmentId: "appt-1",
  });

  assert.match(alert.title, /insufficient balance/i);
  assert.equal(alert.hint, RAZORPAY_TEST_MODE_INSUFFICIENT_BALANCE_HINT);
  assert.equal(alert.extra.hint, RAZORPAY_TEST_MODE_INSUFFICIENT_BALANCE_HINT);
  assert.equal(alert.extra.razorpayTestMode, true);
  assert.equal(alert.extra.status, 400);
  assert.equal(alert.extra.razorpayErrorCode, "BAD_REQUEST_ERROR");
});

test("buildRefundApiFailureAlert: live-mode 400 invalid request stays generic", () => {
  const alert = buildRefundApiFailureAlert({
    keyId: "rzp_live_ABC",
    status: 400,
    errorPayload: { description: "invalid request sent" },
    paymentId: "pay_1",
  });

  assert.equal(alert.title, "Razorpay refund failed (API error)");
  assert.equal(alert.hint, null);
  assert.equal(alert.extra.hint, undefined);
  assert.equal(alert.extra.razorpayTestMode, undefined);
});

test("buildRefundApiFailureAlert: other 400 descriptions are not hinted", () => {
  const alert = buildRefundApiFailureAlert({
    keyId: "rzp_test_ABC",
    status: 400,
    errorPayload: { description: "Payment already refunded" },
    paymentId: "pay_1",
  });

  assert.equal(alert.title, "Razorpay refund failed (API error)");
  assert.equal(alert.hint, null);
  assert.equal(alert.extra.razorpayTestMode, true);
});

test("enrichRefundFailureAlertFromError: appends hint from RazorpaySendError.details", () => {
  const err = new RazorpaySendError("invalid request sent", {
    hint: RAZORPAY_TEST_MODE_INSUFFICIENT_BALANCE_HINT,
    razorpayTestMode: true,
  });
  const enriched = enrichRefundFailureAlertFromError(
    err,
    "Razorpay refund failed after cancel — cancellation still stands",
  );
  assert.match(enriched.title, /insufficient balance/i);
  assert.equal(enriched.extraHint.hint, RAZORPAY_TEST_MODE_INSUFFICIENT_BALANCE_HINT);
});
