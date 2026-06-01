/**
 * @fileoverview Shared request context helper for scribe API routes.
 *
 * Resolves the authenticated user → doctor profile → clinic in one call
 * and returns a typed RequestContext for the service layer.
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient }  from "@/lib/supabase/admin";

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

  const admin = getSupabaseAdminClient();

  const { data: profile } = await admin
    .from("doctor_profiles")
    .select("user_id, clinic_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.clinic_id) return null;

  return {
    actorId:   user.id,
    doctorId:  user.id,
    clinicId:  profile.clinic_id,
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
