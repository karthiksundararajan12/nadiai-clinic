/**
 * GET /api/cron/vaccination-reminders
 *
 * Reminder worker endpoint. Protected by CRON_SECRET (Bearer /
 * Authorization raw / X-Cron-Secret) via assertWorkerAuthorized — same
 * pattern as /api/cron/booking-reminders.
 *
 * Schedule: GitHub Actions .github/workflows/vaccination-reminders.yml runs
 * once daily and also supports workflow_dispatch for a one-click manual
 * run.
 *
 * Modes:
 *   1. Default (no query params) —
 *      VaccinationReminderService.runReminderSweep(): sends a WhatsApp
 *      reminder for `pending` vaccination_schedules due within the next 3
 *      days, and sweeps `reminder_sent` rows whose due_date has passed to
 *      `overdue`.
 *   2. Force one schedule (testing) — ?scheduleId=<uuid>. Bypasses the
 *      due-date window and runs the same claim+send path for that
 *      schedule. Still requires CRON_SECRET; still respects
 *      pending-only/already-sent gates.
 *
 * Template `vaccination_reminder` is stubbed/logged unless BOTH
 * WHATSAPP_TEMPLATES_LIVE=true AND
 * WHATSAPP_VACCINATION_REMINDER_TEMPLATE_LIVE=true — see
 * vaccination-reminder.service.js (isTemplateLive). Do not set the latter
 * until `vaccination_reminder` is confirmed APPROVED in Meta Business
 * Manager.
 */

import { NextResponse } from "next/server";
import {
  ClinicRepository,
  PatientRepository,
  WhatsAppClientService,
  bookingLogger,
  isBookingError,
  toApiError,
} from "@/features/booking";
import { VaccinationRepository } from "@/features/vaccinations/vaccination.repository";
import { VaccinationReminderService } from "@/features/vaccinations/vaccination-reminder.service";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertWorkerAuthorized } from "../../booking/_helpers/worker-auth";

const log = bookingLogger.child({ component: "API /api/cron/vaccination-reminders" });

function createVaccinationReminderService() {
  const supabase = getSupabaseAdminClient();
  const whatsappClient = new WhatsAppClientService({
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    apiVersion: process.env.WHATSAPP_API_VERSION,
  });
  return new VaccinationReminderService(
    new VaccinationRepository(supabase),
    new ClinicRepository(supabase),
    new PatientRepository(supabase),
    whatsappClient,
    {
      templatesLive: process.env.WHATSAPP_TEMPLATES_LIVE === "true",
      vaccinationReminderTemplateLive: process.env.WHATSAPP_VACCINATION_REMINDER_TEMPLATE_LIVE === "true",
    },
  );
}

export async function GET(request) {
  try {
    assertWorkerAuthorized(request);

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get("scheduleId")?.trim() || null;

    const service = createVaccinationReminderService();

    if (scheduleId) {
      const result = await service.sendReminderNow({ scheduleId });
      log.info("Force vaccination reminder invocation finished", result);
      return NextResponse.json({ status: "ok", mode: "force", ...result }, { status: 200 });
    }

    const summary = await service.runReminderSweep();
    return NextResponse.json({ status: "ok", mode: "sweep", ...summary }, { status: 200 });
  } catch (err) {
    log.error("Vaccination reminders endpoint failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isBookingError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
