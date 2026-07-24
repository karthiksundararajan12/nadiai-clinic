import test from "node:test";
import assert from "node:assert/strict";
import { RazorpayClientService } from "../services/razorpay-client.service.js";
import { RazorpayCredentialsError, RazorpaySendError } from "../errors.js";

test("RazorpayClientService: missing credentials throw RazorpayCredentialsError", () => {
  assert.throws(() => new RazorpayClientService({}), RazorpayCredentialsError);
});

test("createRefund: posts full refund with Basic auth and idempotency key", async () => {
  const originalFetch = globalThis.fetch;
  /** @type {RequestInit|undefined} */
  let seenInit;
  /** @type {string|undefined} */
  let seenUrl;
  globalThis.fetch = async (url, init) => {
    seenUrl = String(url);
    seenInit = init;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: "rfnd_123",
          payment_id: "pay_ABC",
          amount: 50000,
          status: "processed",
        };
      },
    };
  };

  try {
    const client = new RazorpayClientService({ keyId: "rzp_test", keySecret: "secret" });
    const result = await client.createRefund({
      paymentId: "pay_ABC",
      idempotencyKey: "appt_cancel_appt-1",
      notes: { appointment_id: "appt-1" },
    });

    assert.equal(seenUrl, "https://api.razorpay.com/v1/payments/pay_ABC/refund");
    assert.equal(seenInit?.method, "POST");
    assert.equal(seenInit?.headers?.["X-Razorpay-Idempotency-Key"], "appt_cancel_appt-1");
    assert.ok(String(seenInit?.headers?.Authorization ?? "").startsWith("Basic "));
    const body = JSON.parse(String(seenInit?.body));
    assert.equal(body.amount, undefined, "full refund must omit amount");
    assert.deepEqual(body.notes, { appointment_id: "appt-1" });
    assert.equal(result.id, "rfnd_123");
    assert.equal(result.paymentId, "pay_ABC");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createRefund: non-OK Razorpay response throws RazorpaySendError", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    async json() {
      return { error: { description: "Payment already refunded" } };
    },
  });

  try {
    const client = new RazorpayClientService({ keyId: "rzp_test", keySecret: "secret" });
    await assert.rejects(
      () => client.createRefund({ paymentId: "pay_1", idempotencyKey: "key-1" }),
      (err) => err instanceof RazorpaySendError && /already refunded/i.test(err.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
