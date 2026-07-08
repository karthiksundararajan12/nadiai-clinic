/**
 * GET /api/cron/booking-reminders
 *
 * Vercel Cron target (see vercel.json — every 15 min). Protected the same
 * way as the scribe worker endpoints: a bearer CRON_SECRET, which Vercel
 * injects automatically on scheduled invocations once that env var is set.
 *
 * Runs ReminderService.runReminderSweep(): sends T-24h/T-2h reminder
 * templates for CONFIRMED appointments crossing each clinic's configured
 * threshold (stubbed/logged unless WHATSAPP_TEMPLATES_LIVE=true), and
 * completes past-due CONFIRMED appointments with no reply.
 */

import { NextResponse } from "next/server";
import {
  createBookingServices,
  isBookingError,
  bookingLogger,
  toApiError,
} from "@/features/booking";
import { assertWorkerAuthorized } from "../../booking/_helpers/worker-auth";

const log = bookingLogger.child({ component: "API /api/cron/booking-reminders" });

export async function GET(request) {
  try {
    assertWorkerAuthorized(request);
    const { reminderService } = createBookingServices();
    const summary = await reminderService.runReminderSweep();
    return NextResponse.json({ status: "ok", ...summary }, { status: 200 });
  } catch (err) {
    log.error("Reminder sweep failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isBookingError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
