import { WorkerUnauthorizedError } from "@/features/booking";

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
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    throw new WorkerUnauthorizedError();
  }

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (token !== expected) {
    throw new WorkerUnauthorizedError();
  }
}
