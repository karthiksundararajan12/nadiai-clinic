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
import { PROFILE_PHOTO } from "@/features/doctor-profile/profile-photo.constants";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({ component: "API /api/doctor-profile/avatar" });

function errorResponse(error) {
  if (error instanceof DoctorProfileRequestError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }

  log.error("Profile photo upload failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: "Failed to upload profile photo" },
    { status: 500 },
  );
}

/**
 * POST /api/doctor-profile/avatar
 * multipart/form-data with field `photo` (JPG/PNG/WebP, max 2MB).
 */
export async function POST(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData().catch(() => null);
    const photo = formData?.get("photo");

    if (!photo || typeof photo === "string" || typeof photo.arrayBuffer !== "function") {
      throw new DoctorProfileRequestError("Photo file is required");
    }

    const mimeType = String(photo.type || "").toLowerCase();
    if (!PROFILE_PHOTO.ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new DoctorProfileRequestError(
        "Photo must be a JPG, PNG, or WebP image",
      );
    }

    if (typeof photo.size === "number" && photo.size > PROFILE_PHOTO.MAX_BYTES) {
      throw new DoctorProfileRequestError("Photo must be 2MB or smaller");
    }

    const bytes = new Uint8Array(await photo.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new DoctorProfileRequestError("Photo file is empty");
    }
    if (bytes.byteLength > PROFILE_PHOTO.MAX_BYTES) {
      throw new DoctorProfileRequestError("Photo must be 2MB or smaller");
    }

    const supabase = getSupabaseAdminClient();
    const service = new DoctorProfileService(
      new DoctorProfileRepository(supabase),
      new ClinicRepository(supabase),
      supabase,
    );

    const result = await service.updateProfilePhoto(ctx.clinicId, ctx.actorId, {
      bytes,
      mimeType,
      size: bytes.byteLength,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
