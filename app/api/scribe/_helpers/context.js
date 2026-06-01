/**
 * @fileoverview Shared request context helper for scribe API routes.
 *
 * Resolves the authenticated user → doctor profile → clinic in one call
 * and returns a typed RequestContext for the service layer.
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient }  from "@/lib/supabase/admin";
import { createScribeServices }    from "@/features/scribe";

/** @typedef {import("@/features/scribe/models/session.model.js").RequestContext} RequestContext */

/**
 * Builds a RequestContext from the current server-side Supabase session.
 *
 * Returns null when the user is unauthenticated or has no doctor profile.
 * The caller MUST 401/403 on a null result.
 *
 * @param {Request} request - Next.js API route request (for IP + UA extraction)
 * @returns {Promise<RequestContext|null>}
 */
export async function resolveRequestContext(request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Use the authenticated server client (anon key + user session cookies) so
  // the RLS policy "Users can read their own profile" (auth.uid() = user_id)
  // applies. This avoids a dependency on the service-role key for this step.
  const { data: profile, error: profileError } = await supabase
    .from("doctor_profiles")
    .select("user_id, clinic_id, clinic_name, clinic_address")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) return null;

  let clinicId = profile.clinic_id;

  // If clinic_id is missing, try to backfill using the admin client.
  if (!clinicId) {
    try {
      const admin = getSupabaseAdminClient();
      clinicId = await backfillClinicId(admin, profile);
    } catch {
      // Admin client unavailable (e.g. bad service-role key) — cannot backfill.
    }
  }

  if (!clinicId) return null;

  return {
    actorId:   user.id,
    doctorId:  user.id,
    clinicId,
    ipAddress: extractIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
    requestId: request.headers.get("x-request-id") ?? undefined,
  };
}

/**
 * Extracts the real client IP, honouring Vercel and Cloudflare forwarding headers.
 *
 * @param {Request} request
 * @returns {string|undefined}
 */
function extractIp(request) {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    undefined
  );
}

/**
 * Single-call helper for all scribe API routes.
 *
 * Resolves the authenticated user, their doctor profile, and wires all scribe
 * services — all using the authenticated server client so Supabase RLS applies
 * without requiring a valid service-role key.
 *
 * Returns null when the user is unauthenticated or has no doctor profile.
 *
 * @param {Request} request
 * @returns {Promise<{ctx: RequestContext; services: ReturnType<typeof createScribeServices>}|null>}
 */
export async function resolveScribeContext(request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("doctor_profiles")
    .select("user_id, clinic_id, clinic_name, clinic_address")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) return null;

  let clinicId = profile.clinic_id;

  if (!clinicId) {
    try {
      const admin = getSupabaseAdminClient();
      clinicId = await backfillClinicId(admin, profile);
    } catch {
      // Admin client unavailable — cannot backfill.
    }
  }

  if (!clinicId) return null;

  const ctx = {
    actorId:   user.id,
    doctorId:  user.id,
    clinicId,
    ipAddress: extractIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
    requestId: request.headers.get("x-request-id") ?? undefined,
  };

  const services = createScribeServices(supabase);
  return { ctx, services };
}

async function backfillClinicId(admin, profile) {
  const clinicName = profile.clinic_name?.trim();
  if (!clinicName) return null;

  const { data: clinic, error: clinicError } = await admin
    .from("clinics")
    .insert({
      name: clinicName,
      whatsapp_provider: "meta",
      whatsapp_setup_status: "pending_verification",
    })
    .select("id")
    .single();

  if (clinicError || !clinic?.id) return null;

  const { error: profileError } = await admin
    .from("doctor_profiles")
    .update({ clinic_id: clinic.id })
    .eq("user_id", profile.user_id);

  if (profileError) return null;
  return clinic.id;
}
