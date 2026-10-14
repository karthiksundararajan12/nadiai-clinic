import { NextResponse } from "next/server";
import { AppointmentRepository, PatientRepository } from "@/features/booking/server-core";
import { VisitVitalsRepository } from "@/features/vitals/visit-vitals.repository";
import { VisitVitalsRequestError, VisitVitalsService } from "@/features/vitals/visit-vitals.service";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/features/scribe/logger.js";

const log = createLogger({ component: "API /api/scribe/visit-vitals" });

function resolveService() {
  const supabase = getSupabaseAdminClient();
  return new VisitVitalsService(
    new VisitVitalsRepository(supabase),
    new PatientRepository(supabase),
    new AppointmentRepository(supabase),
  );
}

function errorResponse(error) {
  if (error instanceof VisitVitalsRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  log.error("Visit vitals API failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json({ error: "Failed to save visit vitals" }, { status: 500 });
}

export async function GET(request) {
  const ctx = await resolveRequestContext(request);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  try {
    const result = await resolveService().find(ctx.clinicId, {
      patientId: url.searchParams.get("patientId"),
      appointmentId: url.searchParams.get("appointmentId"),
      sessionId: url.searchParams.get("sessionId"),
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request) {
  const ctx = await resolveRequestContext(request);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const result = await resolveService().save(ctx.clinicId, body);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
