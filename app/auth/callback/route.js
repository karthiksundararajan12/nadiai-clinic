import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function getRequestOrigin(request) {
  /**
   * Open-redirect hardening:
   * Meta/clients can control certain proxy headers. We ONLY trust forwarded
   * origin when the resulting origin matches an allowlist.
   *
   * Add allowed origins in env:
   *   ALLOWED_ORIGINS="https://your-vercel-domain.com,https://localhost:3000"
   */
  const allowedOriginsRaw = process.env.ALLOWED_ORIGINS || "";
  const allowedOrigins = new Set(
    allowedOriginsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProtoHeader = request.headers.get("x-forwarded-proto");

  const forwardedProto = forwardedProtoHeader
    ? forwardedProtoHeader.toLowerCase()
    : null;

  // Strict scheme check to prevent javascript: / custom schemes.
  const isValidProto = forwardedProto === "http" || forwardedProto === "https";

  if (forwardedHost && isValidProto && allowedOrigins.size > 0) {
    try {
      const candidate = new URL(`${forwardedProto}://${forwardedHost}`);
      const origin = candidate.origin;

      // Safe comparison against allowlist (attacker-controlled headers won't match).
      if (allowedOrigins.has(origin)) return origin;
    } catch {
      // ignore and fall back
    }
  }

  return new URL(request.url).origin;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const origin = getRequestOrigin(request);

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("doctor_profiles")
          .select("onboarding_complete")
          .eq("user_id", user.id)
          .single();

        if (profile?.onboarding_complete) {
          return NextResponse.redirect(`${origin}/dashboard`);
        }
        return NextResponse.redirect(`${origin}/onboarding`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
