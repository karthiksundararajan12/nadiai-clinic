import { NextResponse } from "next/server";
import {
  AppointmentRepository,
  PatientRepository,
  bookingLogger,
} from "@/features/booking";
import {
  PatientRequestError,
  PatientsService,
} from "@/features/patients/patients.service";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({ component: "API /api/patients" });

function errorResponse(error) {
  if (error instanceof PatientRequestError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }

  log.error("Patients API failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: "Failed to process patient request" },
    { status: 500 },
  );
}

async function resolvePatientsService() {
  const supabase = getSupabaseAdminClient();
  return new PatientsService(
    new PatientRepository(supabase),
    new AppointmentRepository(supabase),
  );
}

export async function GET(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = await resolvePatientsService();
    const result = await service.list(ctx.clinicId);
    return NextResponse.json(result, { status: 200 });
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
    const service = await resolvePatientsService();
    const result = await service.create(ctx.clinicId, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
