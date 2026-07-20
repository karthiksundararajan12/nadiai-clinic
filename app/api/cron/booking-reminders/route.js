/**
 * GET /api/cron/booking-reminders
 *
 * Reminder worker endpoint. Protected by CRON_SECRET (Bearer /
 * Authorization raw / X-Cron-Secret) via assertWorkerAuthorized — same
 * pattern as other booking worker routes.
 *
 /**
 * GET /api/cron/booking-reminders
 *
 * Reminder worker endpoint. Protected by CRON_SECRET (Bearer /
 * Authorization raw / X-Cron-Secret) via assertWorkerAuthorized — same
 * pattern as other booking worker routes.
 *
 * Schedule: GitHub Actions .github/workflows/booking-reminders.yml
 * runs every 15 minutes (cron: star-slash-15 star star star star) and also supports
 * workflow_dispatch for a one-click manual run. (vercel.json currently
 * has no crons — comments elsewhere that mention vercel.json scheduling
 * are stale.)
 *
 * Modes:
 *   1. Default (no query params) — ReminderService.runReminderSweep():
 *      sends T-24h / T-2h reminders for CONFIRMED appointments that fall
 *      inside each clinic's configured offset window, and auto-completes
 *      past-due CONFIRMED appointments with no reply.
 *   2. Force one appointment (testing) —
 *      ?appointmentId=<uuid>&kind=2h (or kind=24h)
 *      Bypasses the time window and runs the same claim+send path for
 *      that appointment. Still requires CRON_SECRET; still respects
 *      CONFIRMED-only, already-sent, and reminders_enabled gates.
 *
 * Templates are stubbed/logged unless WHATSAPP_TEMPLATES_LIVE=true.
 */
 *
 * Modes:
 *   1. Default (no query params) — ReminderService.runReminderSweep():
 *      sends T-24h / T-2h reminders for CONFIRMED appointments that fall
 *      inside each clinic's configured offset window, and auto-completes
 *      past-due CONFIRMED appointments with no reply.
 *   2. Force one appointment (testing) —
 *      `?appointmentId=<uuid>&kind=2h` (or `kind=24h`)
 *      Bypasses the time window and runs the same claim+send path for
 *      that appointment. Still requires CRON_SECRET; still respects
 *      CONFIRMED-only, already-sent, and reminders_enabled gates.
 *
 * Templates are stubbed/logged unless WHATSAPP_TEMPLATES_LIVE=true.
 */

import { NextResponse } from "next/server";
import {
  createBookingServices,
  isBookingError,
  bookingLogger,
  toApiError,
  REMINDER_KIND,
} from "@/features/booking";
import { assertWorkerAuthorized } from "../../booking/_helpers/worker-auth";

const log = bookingLogger.child({ component: "API /api/cron/booking-reminders" });

export async function GET(request) {
  try {
    assertWorkerAuthorized(request);

    const { searchParams } = new URL(request.url);
    const appointmentId = searchParams.get("appointmentId")?.trim() || null;
    const kindParam = searchParams.get("kind")?.trim() || null;

    const { reminderService } = createBookingServices();

    if (appointmentId || kindParam) {
      if (!appointmentId || !kindParam) {
        return NextResponse.json(
          {
            error: "Both appointmentId and kind are required for a force send",
            code: "MISSING_FORCE_PARAMS",
            details: {
              appointmentId: Boolean(appointmentId),
              kind: Boolean(kindParam),
              allowedKinds: Object.values(REMINDER_KIND),
            },
          },
          { status: 400 },
        );
      }

      const result = await reminderService.sendReminderNow({
        appointmentId,
        kind: kindParam,
      });
      log.info("Force reminder invocation finished", result);
      return NextResponse.json({ status: "ok", mode: "force", ...result }, { status: 200 });
    }

    const summary = await reminderService.runReminderSweep();
    return NextResponse.json({ status: "ok", mode: "sweep", ...summary }, { status: 200 });
  } catch (err) {
    log.error("Reminder endpoint failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isBookingError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
