import test from "node:test";
import assert from "node:assert/strict";
import { buildHighlightRedirectPath } from "./appointments.client.js";

// Covers the redirect used by the dashboard "New Appointment" flow: after a
// successful create, the caller should land back on /appointments with the
// new row highlighted (same `?highlight=` mechanism as /notifications).

test("buildHighlightRedirectPath builds a /appointments?highlight= path for a valid id", () => {
  assert.equal(
    buildHighlightRedirectPath("11111111-1111-1111-1111-111111111111"),
    "/appointments?highlight=11111111-1111-1111-1111-111111111111",
  );
});

test("buildHighlightRedirectPath URL-encodes the id", () => {
  assert.equal(
    buildHighlightRedirectPath("id with space"),
    "/appointments?highlight=id%20with%20space",
  );
});

test("buildHighlightRedirectPath returns null for a missing id", () => {
  assert.equal(buildHighlightRedirectPath(null), null);
  assert.equal(buildHighlightRedirectPath(undefined), null);
  assert.equal(buildHighlightRedirectPath(""), null);
});

test("buildHighlightRedirectPath returns null for a non-string id", () => {
  assert.equal(buildHighlightRedirectPath(42), null);
  assert.equal(buildHighlightRedirectPath({ id: "x" }), null);
});
