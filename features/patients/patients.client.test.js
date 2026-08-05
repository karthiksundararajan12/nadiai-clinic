import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHighlightRedirectPath,
  deletePatient,
  fetchPatientDeletionImpact,
} from "./patients.client.js";

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

test("fetchPatientDeletionImpact GETs deletion-impact endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      async json() {
        return { impact: { appointments: 2, blocked: false } };
      },
    };
  };
  try {
    const payload = await fetchPatientDeletionImpact("patient-1");
    assert.equal(calls[0].url, "/api/patients/patient-1/deletion-impact");
    assert.equal(payload.impact.appointments, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deletePatient DELETEs /api/patients/[id]", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      async json() {
        return { deleted: true, patientId: "patient-1" };
      },
    };
  };
  try {
    const result = await deletePatient("patient-1");
    assert.equal(calls[0].url, "/api/patients/patient-1");
    assert.equal(calls[0].opts.method, "DELETE");
    assert.equal(result.deleted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
