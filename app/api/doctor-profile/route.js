import { NextResponse } from "next/server";
import { DoctorProfileRepository, bookingLogger } from "@/features/booking";
import {
  DoctorProfileRequestError,
  DoctorProfileService,
} from "@/features/doctor-profile/doctor-profile.service";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({ component: "API /api/doctor-profile" });

function errorResponse(error) {
  if (error instanceof DoctorProfileRequestError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }

  log.error("Doctor profile API failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: "Failed to process doctor profile request" },
    { status: 500 },
  );
}

async function resolveDoctorProfileService() {
  const supabase = getSupabaseAdminClient();
  return new DoctorProfileService(new DoctorProfileRepository(supabase));
}

export async function GET(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = await resolveDoctorProfileService();
    const result = await service.getConsultationFee(ctx.clinicId, ctx.actorId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const service = await resolveDoctorProfileService();
    const result = await service.updateConsultationFee(
      ctx.clinicId,
      ctx.actorId,
      body.consultationFee,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
