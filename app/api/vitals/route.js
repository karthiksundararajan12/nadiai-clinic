import { NextResponse } from "next/server";
import {
  AppointmentRepository,
  PatientRepository,
  bookingLogger,
} from "@/features/booking";
import { VitalsRepository } from "@/features/vitals/vitals.repository";
import { VitalsRequestError, VitalsService } from "@/features/vitals/vitals.service";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({ component: "API /api/vitals" });

/**
 * GET /api/vitals?patientId=… → { vitals } — full history, most recent
 *   first, scoped to the requesting clinic.
 *
 * POST /api/vitals { appointmentId | patientId, ...vital fields } →
 *   { vitals } — see VitalsService.create for why appointmentId (when
 *   given) is authoritative over any patientId also present in the body.
 */

function resolveVitalsService() {
  const supabase = getSupabaseAdminClient();
  return new VitalsService(
    new VitalsRepository(supabase),
    new PatientRepository(supabase),
    new AppointmentRepository(supabase),
  );
}

function errorResponse(error) {
  if (error instanceof VitalsRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  log.error("Vitals API failed", {
    error: error instanceof Error ? error.message : String(error),
    code: error?.code,
    cause: error?.cause ?? null,
    stack: error instanceof Error ? error.stack : undefined,
  });
  return NextResponse.json(
    { error: "Failed to process vitals request" },
    { status: 500 },
  );
}

export async function GET(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId");
    if (!patientId) {
      return NextResponse.json({ error: "patientId is required" }, { status: 400 });
    }

    const service = resolveVitalsService();
    const vitals = await service.listForPatient(ctx.clinicId, patientId);
    return NextResponse.json({ vitals }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const service = resolveVitalsService();
    const result = await service.create(ctx.clinicId, ctx.actorId, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
