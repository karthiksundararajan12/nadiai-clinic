import { WorkerUnauthorizedError } from "../../../../features/booking/errors.js";

/**
 * @param {Request} request
 * @returns {{ debug: Record<string, unknown>; authorized: boolean }}
 */
export function inspectWorkerAuth(request) {
  const expected = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";

  let authScheme = "none";
  if (auth.toLowerCase().startsWith("bearer ")) authScheme = "bearer";
  else if (auth.toLowerCase().startsWith("basic ")) authScheme = "basic";
  else if (auth) authScheme = "other";

  const token = authScheme === "bearer"
    ? auth.slice(auth.indexOf(" ") + 1)
    : "";

  const debug = {
    secretConfigured: Boolean(expected),
    hasAuthHeader: Boolean(auth),
    authScheme,
    bearerPrefixPresent: authScheme === "bearer",
    tokenLength: token.length,
    expectedLength: expected?.length ?? 0,
    exactMatch: token === expected,
    trimmedMatch: token.trim() === (expected?.trim() ?? ""),
    tokenHasSpaces: token.includes(" "),
    tokenHasPlus: token.includes("+"),
    expectedHasPlus: expected?.includes("+") ?? false,
    userAgent: request.headers.get("user-agent")?.slice(0, 80) ?? null,
  };

  return {
    debug,
    authorized: Boolean(expected) && token === expected,
  };
}

/**
 * Validates a server-to-server worker/cron request.
 *
 * Configure CRON_SECRET in production — Vercel Cron automatically sends
 * `Authorization: Bearer $CRON_SECRET` on every scheduled invocation when
 * that env var is set (see vercel.json's `crons` entry for
 * /api/cron/booking-reminders), so no extra wiring is needed beyond
 * setting the env var.
 *
 * @param {Request} request
 */
export function assertWorkerAuthorized(request) {
  const { debug, authorized } = inspectWorkerAuth(request);

  // #region agent log
  fetch("http://127.0.0.1:7272/ingest/6f881d0b-0cc5-4b5b-a0c3-4d9a2589ea52", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "f16eb8",
    },
    body: JSON.stringify({
      sessionId: "f16eb8",
      location: "worker-auth.js:assertWorkerAuthorized",
      message: "worker auth check",
      data: debug,
      timestamp: Date.now(),
      hypothesisId: "H1-H5",
    }),
  }).catch(() => {});
  // #endregion

  if (!debug.secretConfigured) {
    throw new WorkerUnauthorizedError({ ...debug, failReason: "secret_not_configured" });
  }

  if (!authorized) {
    throw new WorkerUnauthorizedError({ ...debug, failReason: "token_mismatch" });
  }
}
