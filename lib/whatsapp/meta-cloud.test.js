import test from "node:test";
import assert from "node:assert/strict";
import {
  addPhoneNumberToWaba,
  getMetaAccessToken,
  registerPhoneNumber,
} from "./meta-cloud.js";

test("getMetaAccessToken prioritizes customer token", () => {
  process.env.META_SYSTEM_USER_TOKEN = "system-token";
  process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
  assert.equal(getMetaAccessToken("customer-token"), "customer-token");
});

test("registerPhoneNumber skips when META_PHONE_NUMBER_PIN missing", async () => {
  delete process.env.META_PHONE_NUMBER_PIN;
  const result = await registerPhoneNumber("123", "token");
  assert.equal(result.skipped, true);
});

test("registerPhoneNumber skips when META_PHONE_NUMBER_PIN is not 6 digits", async () => {
  process.env.META_PHONE_NUMBER_PIN = "6_digit_pin_for_registered_numbers";
  const result = await registerPhoneNumber("123", "token");
  assert.equal(result.skipped, true);
  assert.ok(result.reason.includes("6 numeric digits"));
  delete process.env.META_PHONE_NUMBER_PIN;
});

test("registerPhoneNumber proceeds when META_PHONE_NUMBER_PIN is valid 6 digits", async () => {
  process.env.META_PHONE_NUMBER_PIN = "847362";
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ success: true }),
  });
  const result = await registerPhoneNumber("pnid_123", "token");
  assert.equal(result.success, true);
  global.fetch = originalFetch;
  delete process.env.META_PHONE_NUMBER_PIN;
});

test("addPhoneNumberToWaba returns id on success", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ id: "pnid_123" }),
  });

  const result = await addPhoneNumberToWaba(
    "waba",
    "token",
    { cc: "91", phoneNumber: "9999999999" },
    "Clinic Name"
  );

  assert.equal(result.success, true);
  assert.equal(result.phoneNumberId, "pnid_123");
  global.fetch = originalFetch;
});

test("addPhoneNumberToWaba surfaces user-friendly error from Meta", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    json: async () => ({
      error: {
        message: "Invalid parameter",
        error_user_msg: "Phone numbers count exceeded limit per business",
      },
    }),
  });

  const result = await addPhoneNumberToWaba(
    "waba",
    "token",
    { cc: "91", phoneNumber: "9999999999" },
    "Clinic Name"
  );

  assert.equal(result.success, false);
  assert.equal(
    result.error,
    "Phone numbers count exceeded limit per business"
  );
  global.fetch = originalFetch;
});

test("addPhoneNumberToWaba recovers existing phone_number_id when already in WABA", async () => {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async (url) => {
    callCount++;
    if (callCount === 1) {
      // First call: POST to add — Meta says already exists
      return {
        ok: false,
        json: async () => ({
          error: { code: 100, message: "Phone number already exists in WABA" },
        }),
      };
    }
    // Second call: GET list — return existing number
    return {
      ok: true,
      json: async () => ({
        data: [
          { id: "existing_pnid", display_phone_number: "+91 99999 99999" },
        ],
      }),
    };
  };

  const result = await addPhoneNumberToWaba(
    "waba",
    "token",
    { cc: "91", phoneNumber: "9999999999" },
    "Clinic Name"
  );

  assert.equal(result.success, true);
  assert.equal(result.phoneNumberId, "existing_pnid");
  assert.equal(result.alreadyExisted, true);
  global.fetch = originalFetch;
});
