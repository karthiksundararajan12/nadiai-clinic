import test from "node:test";
import assert from "node:assert/strict";
import { inspectWorkerAuth } from "../../../app/api/booking/_helpers/worker-auth.js";

const SECRET = "test-secret-with+plus=chars";

function mockRequest(headers = {}) {
  return {
    headers: {
      get(name) {
        const key = Object.keys(headers).find(
          (k) => k.toLowerCase() === name.toLowerCase(),
        );
        return key ? headers[key] : null;
      },
    },
  };
}

test("H1: no Authorization header", () => {
  process.env.CRON_SECRET = SECRET;
  const { debug, authorized } = inspectWorkerAuth(mockRequest());
  assert.equal(debug.hasAuthHeader, false);
  assert.equal(debug.authScheme, "none");
  assert.equal(authorized, false);
});

test("H2: Basic auth instead of Bearer", () => {
  process.env.CRON_SECRET = SECRET;
  const { debug, authorized } = inspectWorkerAuth(
    mockRequest({ authorization: "Basic dXNlcjpwYXNz" }),
  );
  assert.equal(debug.authScheme, "basic");
  assert.equal(debug.bearerPrefixPresent, false);
  assert.equal(authorized, false);
});

test("H3: plus corrupted to spaces in token", () => {
  process.env.CRON_SECRET = SECRET;
  const corrupted = SECRET.replaceAll("+", " ");
  const { debug, authorized } = inspectWorkerAuth(
    mockRequest({ authorization: `Bearer ${corrupted}` }),
  );
  assert.equal(debug.tokenHasSpaces, true);
  assert.equal(debug.expectedHasPlus, true);
  assert.equal(debug.tokenHasPlus, false);
  assert.equal(authorized, false);
});

test("H4: raw token without Bearer prefix is accepted", () => {
  process.env.CRON_SECRET = SECRET;
  const { debug, authorized } = inspectWorkerAuth(
    mockRequest({ authorization: SECRET }),
  );
  assert.equal(debug.authScheme, "other");
  assert.equal(debug.authSource, "authorization-raw");
  assert.equal(authorized, true);
});

test("H5: trailing whitespace is trimmed", () => {
  process.env.CRON_SECRET = SECRET;
  const { debug, authorized } = inspectWorkerAuth(
    mockRequest({ authorization: `Bearer ${SECRET} ` }),
  );
  assert.equal(debug.authSource, "authorization-bearer");
  assert.equal(authorized, true);
});

test("X-Cron-Secret header is accepted", () => {
  process.env.CRON_SECRET = SECRET;
  const { debug, authorized } = inspectWorkerAuth(
    mockRequest({ "x-cron-secret": SECRET }),
  );
  assert.equal(debug.authSource, "x-cron-secret");
  assert.equal(authorized, true);
});

test("valid Bearer token authorizes", () => {
  process.env.CRON_SECRET = SECRET;
  const { debug, authorized } = inspectWorkerAuth(
    mockRequest({ authorization: `Bearer ${SECRET}` }),
  );
  assert.equal(debug.authScheme, "bearer");
  assert.equal(debug.authSource, "authorization-bearer");
  assert.equal(authorized, true);
});
