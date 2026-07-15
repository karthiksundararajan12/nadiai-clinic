import { NextResponse } from "next/server";
import {
  ClinicRepository,
  DoctorProfileRepository,
  bookingLogger,
} from "@/features/booking";
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
  return new DoctorProfileService(
    new DoctorProfileRepository(supabase),
    new ClinicRepository(supabase),
  );
}

export async function GET(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = await resolveDoctorProfileService();
    const result = await service.getSettings(ctx.clinicId, ctx.actorId);
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

    if (body.consultationFee !== undefined && body.clinic !== undefined) {
      const [feeResult, clinicResult] = await Promise.all([
        service.updateConsultationFee(ctx.clinicId, ctx.actorId, body.consultationFee),
        service.updateClinicSettings(ctx.clinicId, ctx.actorId, body.clinic),
      ]);
      return NextResponse.json({ ...feeResult, ...clinicResult }, { status: 200 });
    }

    if (body.consultationFee !== undefined) {
      const result = await service.updateConsultationFee(
        ctx.clinicId,
        ctx.actorId,
        body.consultationFee,
      );
      return NextResponse.json(result, { status: 200 });
    }

    if (body.clinic !== undefined) {
      const result = await service.updateClinicSettings(
        ctx.clinicId,
        ctx.actorId,
        body.clinic,
      );
      return NextResponse.json(result, { status: 200 });
    }

    if (body.profile !== undefined) {
      const result = await service.updatePersonalProfile(
        ctx.clinicId,
        ctx.actorId,
        body.profile,
      );
      return NextResponse.json(result, { status: 200 });
    }

    if (body.notifications !== undefined) {
      const result = await service.updateNotificationSettings(
        ctx.clinicId,
        ctx.actorId,
        body.notifications,
      );
      return NextResponse.json(result, { status: 200 });
    }

    if (body.preferences !== undefined) {
      const result = await service.updatePreferences(
        ctx.clinicId,
        ctx.actorId,
        body.preferences,
      );
      return NextResponse.json(result, { status: 200 });
    }

    throw new DoctorProfileRequestError(
      "Request must include consultationFee, clinic, profile, notifications, and/or preferences",
    );
  } catch (error) {
    return errorResponse(error);
  }
}
