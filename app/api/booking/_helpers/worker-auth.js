import { WorkerUnauthorizedError } from "../../../../features/booking/errors.js";

/**
 * @param {Request} request
 * @returns {{ debug: Record<string, unknown>; authorized: boolean }}
 */
export function inspectWorkerAuth(request) {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const auth = request.headers.get("authorization") || "";
  const cronSecretHeader = request.headers.get("x-cron-secret") || "";

  let authScheme = "none";
  if (auth.toLowerCase().startsWith("bearer ")) authScheme = "bearer";
  else if (auth.toLowerCase().startsWith("basic ")) authScheme = "basic";
  else if (auth) authScheme = "other";

  let token = "";
  let authSource = "none";

  if (cronSecretHeader) {
    token = cronSecretHeader.trim();
    authSource = "x-cron-secret";
  } else if (authScheme === "bearer") {
    token = auth.slice(auth.indexOf(" ") + 1).trim();
    authSource = "authorization-bearer";
  } else if (authScheme === "other") {
    token = auth.trim();
    authSource = "authorization-raw";
  }

  const debug = {
    secretConfigured: Boolean(expected),
    hasAuthHeader: Boolean(auth),
    hasCronSecretHeader: Boolean(cronSecretHeader),
    authSource,
    authScheme,
    bearerPrefixPresent: authScheme === "bearer",
    tokenLength: token.length,
    expectedLength: expected.length,
    exactMatch: token === expected,
    tokenHasSpaces: token.includes(" "),
    tokenHasPlus: token.includes("+"),
    expectedHasPlus: expected.includes("+"),
    userAgent: request.headers.get("user-agent")?.slice(0, 80) ?? null,
  };

  return {
    debug,
    authorized: Boolean(expected) && Boolean(token) && token === expected,
  };
}

/**
 * Validates a server-to-server worker/cron request.
 *
 * Accepts the secret via any of:
 *  - `Authorization: Bearer <CRON_SECRET>`
 *  - `Authorization: <CRON_SECRET>` (raw — common cron-job.org setup)
 *  - `X-Cron-Secret: <CRON_SECRET>` (recommended for cron-job.org)
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
      runId: "post-fix",
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
