/**
 * GET /api/cron/daily-digest
 *
 * Reports yesterday's bookings succeeded/failed, vaccination seeding/
 * reminder failures, webhook errors, and WhatsApp send failures to the
 * same ops alert channel as every other alertOps() call — see
 * DailyDigestService and features/booking/lib/alerting.js.
 *
 * Protected by CRON_SECRET (Bearer / Authorization raw / X-Cron-Secret)
 * via assertWorkerAuthorized — same pattern as
 * /api/cron/booking-reminders and /api/cron/vaccination-reminders.
 *
 * Schedule: GitHub Actions .github/workflows/daily-digest.yml runs once
 * daily shortly after midnight IST and also supports workflow_dispatch for
 * a one-click manual run — same infra as the two reminder crons, not a new
 * scheduler.
 */

import { NextResponse } from "next/server";
import {
  AppointmentRepository,
  OpsAlertRepository,
  DailyDigestService,
  bookingLogger,
  isBookingError,
  toApiError,
} from "@/features/booking";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertWorkerAuthorized } from "../../booking/_helpers/worker-auth";

const log = bookingLogger.child({ component: "API /api/cron/daily-digest" });

function createDailyDigestService() {
  const supabase = getSupabaseAdminClient();
  return new DailyDigestService(new AppointmentRepository(supabase), new OpsAlertRepository(supabase));
}

export async function GET(request) {
  try {
    assertWorkerAuthorized(request);

    const service = createDailyDigestService();
    const result = await service.sendDailyDigest();
    log.info("Daily digest run finished", result);
    return NextResponse.json({ status: "ok", ...result }, { status: 200 });
  } catch (err) {
    log.error("Daily digest endpoint failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isBookingError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
