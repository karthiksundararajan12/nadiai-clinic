import test from "node:test";
import assert from "node:assert/strict";
import { buildHighlightRedirectPath } from "./patients.client.js";

// Covers the redirect used by the dashboard "Add Patient" flow: after a
// successful create, the caller should land back on /patients with the new
// row highlighted (same `?highlight=` mechanism as /appointments).

test("buildHighlightRedirectPath builds a /patients?highlight= path for a valid id", () => {
  assert.equal(
    buildHighlightRedirectPath("11111111-1111-1111-1111-111111111111"),
    "/patients?highlight=11111111-1111-1111-1111-111111111111",
  );
});

test("buildHighlightRedirectPath URL-encodes the id", () => {
  assert.equal(
    buildHighlightRedirectPath("id with space"),
    "/patients?highlight=id%20with%20space",
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
