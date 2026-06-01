import { WorkerUnauthorizedError } from "@/features/scribe";

/**
 * Validates a server-to-server worker request.
 * Configure SCRIBE_WORKER_SECRET or CRON_SECRET in production.
 *
 * @param {Request} request
 */
export function assertWorkerAuthorized(request) {
  const expected = process.env.SCRIBE_WORKER_SECRET || process.env.CRON_SECRET;
  if (!expected) {
    throw new WorkerUnauthorizedError();
  }

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (token !== expected) {
    throw new WorkerUnauthorizedError();
  }
}
