import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHighlightRedirectPath,
  cancelConfirmedAppointment,
  deleteAppointment,
  fetchAppointmentDeletionImpact,
  retryFailedRefund,
} from "./appointments.client.js";

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

test("cancelConfirmedAppointment posts to /api/appointments/[id]/cancel", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      async json() {
        return { appointment: { id: "appt-1", status: "cancelled" } };
      },
    };
  };
  try {
    const result = await cancelConfirmedAppointment("appt-1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/appointments/appt-1/cancel");
    assert.equal(calls[0].opts.method, "POST");
    assert.equal(result.id, "appt-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cancelConfirmedAppointment throws on non-OK response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    async json() {
      return { error: "Only confirmed appointments can be cancelled" };
    },
  });
  try {
    await assert.rejects(
      () => cancelConfirmedAppointment("appt-1"),
      /Only confirmed appointments can be cancelled/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retryFailedRefund posts to /api/appointments/[id]/retry-refund", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      async json() {
        return { appointment: { id: "appt-1", refund_status: "completed" } };
      },
    };
  };
  try {
    const result = await retryFailedRefund("appt-1");
    assert.equal(calls[0].url, "/api/appointments/appt-1/retry-refund");
    assert.equal(calls[0].opts.method, "POST");
    assert.equal(result.refund_status, "completed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retryFailedRefund appends hint from failed response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    async json() {
      return {
        error: "invalid request sent",
        hint: "likely test-mode insufficient balance — check Razorpay dashboard",
      };
    },
  });
  try {
    await assert.rejects(
      () => retryFailedRefund("appt-1"),
      /invalid request sent.*insufficient balance/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchAppointmentDeletionImpact GETs deletion-impact endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      async json() {
        return { impact: { bookingInvoices: 1, scribeSessions: 0, blocked: false } };
      },
    };
  };
  try {
    const impact = await fetchAppointmentDeletionImpact("appt-1");
    assert.equal(calls[0].url, "/api/appointments/appt-1/deletion-impact");
    assert.equal(impact.bookingInvoices, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deleteAppointment DELETEs /api/appointments/[id]", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      async json() {
        return { deleted: true, appointmentId: "appt-1" };
      },
    };
  };
  try {
    const result = await deleteAppointment("appt-1");
    assert.equal(calls[0].url, "/api/appointments/appt-1");
    assert.equal(calls[0].opts.method, "DELETE");
    assert.equal(result.deleted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
