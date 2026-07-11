import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Server-to-server webhooks (Meta, Razorpay) never carry a Supabase session —
// they authenticate via their own signature schemes (X-Hub-Signature-256,
// X-Razorpay-Signature) inside the route handlers themselves. Redirecting
// these to /login would return a 307 instead of the expected 200/401, which
// providers treat as a delivery failure and eventually disable the webhook.
const PUBLIC_WEBHOOK_PATHS = ["/api/whatsapp/webhook", "/api/webhooks/razorpay"];

// Same problem, different auth scheme: Vercel Cron invocations (and other
// server-to-server "worker" callers) carry a Bearer CRON_SECRET, never a
// Supabase session — see app/api/booking/_helpers/worker-auth.js. Matched by
// prefix so future cron endpoints don't need a middleware change too.
const UNAUTHENTICATED_WORKER_PATH_PREFIXES = ["/api/cron/"];

// Public routes that intentionally use authentication other than a doctor
// Supabase session (worker secret), or must be reachable before a session
// exists (account recovery).
const PUBLIC_SESSIONLESS_PATHS = [
  "/api/scribe/transcription/worker",
  "/recover",
];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_WEBHOOK_PATHS.some((path) => pathname === path) ||
    PUBLIC_SESSIONLESS_PATHS.some((path) => pathname === path) ||
    UNAUTHENTICATED_WORKER_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || !url.startsWith("http")) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    pathname !== "/login" &&
    !pathname.startsWith("/auth/")
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  supabaseResponse.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  supabaseResponse.headers.set("Pragma", "no-cache");

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
