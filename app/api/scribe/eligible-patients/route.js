/**
 * GET /api/scribe/eligible-patients
 *
 * Patients with a CONFIRMED appointment that does not already have a
 * COMPLETED scribe_sessions row for that appointment_id. Powers the Scribe
 * "Select patient to start consultation" dropdown.
 */

import { NextResponse } from "next/server";
import { AppointmentRepository } from "@/features/booking";
import { SessionRepository } from "@/features/scribe/repository/session.repository.js";
import { EligibleConsultationService } from "@/features/scribe/services/eligible-consultation.service.js";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { scribeLogger } from "@/features/scribe";

const log = scribeLogger.child({ component: "API /api/scribe/eligible-patients" });

export async function GET(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdminClient();
    const service = new EligibleConsultationService(
      new AppointmentRepository(supabase),
      new SessionRepository(supabase),
    );

    const patients = await service.listEligiblePatients(ctx.clinicId);
    return NextResponse.json({ patients }, { status: 200 });
  } catch (error) {
    log.error("GET /api/scribe/eligible-patients failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to load eligible patients" },
      { status: 500 },
    );
  }
}
