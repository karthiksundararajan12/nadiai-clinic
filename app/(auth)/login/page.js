"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, FileText, Loader2, MessageCircle, Mic } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const BENEFITS = [
  { icon: MessageCircle, label: "WhatsApp booking" },
  { icon: Mic, label: "AI scribe with doctor approval" },
  { icon: FileText, label: "Prescriptions in one tap" },
];

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function fieldErrorId(name) {
  return `${name}-error`;
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const busy = loading || emailLoading;

  // OAuth leaves this page via full navigation. If the user returns via
  // back/forward cache (or the redirect never fires), React state can still
  // have loading === true — reset so the button is clickable again.
  useEffect(() => {
    const onPageShow = (event) => {
      if (event.persisted) setLoading(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "auth_failed") {
      setError("Sign-in failed. Please try again.");
      setLoading(false);
    }
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          // Take control of navigation so we can reset loading if redirect
          // never happens (misconfigured redirect URI, blocked navigation, etc.).
          skipBrowserRedirect: true,
        },
      });
      if (oauthError) throw oauthError;
      if (!data?.url) {
        throw new Error("Failed to start Google sign-in. Please try again.");
      }
      // replace() drops this loading page from history so Back won't restore
      // a stuck "Signing in..." snapshot.
      window.location.replace(data.url);
    } catch (err) {
      setError(err.message || "Failed to sign in. Please try again.");
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    const trimmed = email.trim();
    if (!trimmed) nextErrors.email = "Enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!password) nextErrors.password = "Enter your password.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setEmailLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const signIn = supabase.auth.signInWithPassword;
      if (typeof signIn !== "function") {
        throw new Error("Sign-in failed. Please try again.");
      }
      const { error: signInError } = await signIn.call(supabase.auth, {
        email: trimmed,
        password,
      });
      if (signInError) throw signInError;
      window.location.assign("/");
    } catch (err) {
      setError(err.message || "Sign-in failed. Please try again.");
      setEmailLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground 2xl:text-lg">
      <div className="mx-auto flex min-h-dvh w-full flex-col lg:max-w-6xl lg:flex-row lg:px-6 lg:py-8 2xl:max-w-[1600px] 2xl:px-8 2xl:py-10">
        <aside className="hidden flex-col justify-between bg-primary px-10 py-12 text-primary-foreground lg:flex lg:w-[45%] lg:rounded-l-2xl 2xl:px-14 2xl:py-16">
          <BrandLogo size="xl" onDark textClassName="text-primary-foreground text-2xl 2xl:text-3xl" priority />
          <div className="max-w-md">
            <h1 className="font-display text-4xl font-bold leading-[1.15] tracking-tight text-primary-foreground 2xl:text-5xl">
              Run your clinic on WhatsApp.
            </h1>
            <ul className="mt-8 space-y-4 2xl:mt-10 2xl:space-y-5">
              {BENEFITS.map((item) => (
                <li key={item.label} className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15">
                    <item.icon className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                  </span>
                  <span className="text-base font-semibold 2xl:text-lg">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="border-t border-primary-foreground/25 pt-6 text-sm font-medium text-primary-foreground/80 2xl:text-base">
            DPDP Act 2023 compliant
          </p>
        </aside>

        <main className="flex flex-1 flex-col justify-center px-4 py-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:items-center lg:w-[55%] lg:rounded-r-2xl lg:border lg:border-l-0 lg:border-border lg:bg-card lg:px-12 lg:py-10 2xl:px-16">
          <div className="mb-8 w-full sm:max-w-md lg:hidden">
            <BrandLogo size="lg" priority />
            <h1 className="mt-4 font-display text-2xl font-bold leading-tight tracking-tight text-foreground 2xl:text-3xl">
              Run your clinic on WhatsApp.
            </h1>
          </div>

          <div className="w-full sm:max-w-md">
            <div className="mb-6 2xl:mb-8">
              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground 2xl:text-3xl">
                Welcome back
              </h2>
              <p className="mt-2 text-base text-muted-foreground 2xl:text-lg">
                Sign in to your clinic dashboard
              </p>
            </div>

            {error && (
              <div
                className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3"
                role="alert"
                aria-live="assertive"
              >
                <p className="text-base font-medium text-destructive 2xl:text-lg">{error}</p>
              </div>
            )}

            <Button
              type="button"
              onClick={handleGoogleLogin}
              disabled={busy}
              aria-busy={loading || undefined}
              className="h-11 min-h-11 w-full gap-3 text-base 2xl:h-12 2xl:min-h-12 2xl:text-lg"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-card">
                  <GoogleIcon />
                </span>
              )}
              {loading ? "Signing in..." : "Continue with Google"}
            </Button>

            <div className="relative my-6 2xl:my-8">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-sm text-muted-foreground lg:bg-card 2xl:text-base">
                  or
                </span>
              </div>
            </div>

            <form className="space-y-4 2xl:space-y-5" onSubmit={handleEmailSignIn} noValidate>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-base text-foreground 2xl:text-lg">
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  value={email}
                  disabled={busy}
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={fieldErrors.email ? fieldErrorId("email") : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }
                  }}
                  className="h-11 min-h-11 text-base 2xl:h-12 2xl:min-h-12 2xl:text-lg"
                />
                {fieldErrors.email ? (
                  <p id={fieldErrorId("email")} className="text-sm font-medium text-destructive 2xl:text-base" role="alert">
                    {fieldErrors.email}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password" className="text-base text-foreground 2xl:text-lg">
                    Password
                  </Label>
                  <a
                    id="forgot-password"
                    href="#forgot-password"
                    className="rounded-sm text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring 2xl:text-base"
                  >
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    disabled={busy}
                    aria-invalid={fieldErrors.password ? true : undefined}
                    aria-describedby={fieldErrors.password ? fieldErrorId("password") : undefined}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (fieldErrors.password) {
                        setFieldErrors((prev) => ({ ...prev, password: undefined }));
                      }
                    }}
                    className="h-11 min-h-11 pr-12 text-base 2xl:h-12 2xl:min-h-12 2xl:text-lg"
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 inline-flex h-11 min-h-11 w-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
                  </button>
                </div>
                {fieldErrors.password ? (
                  <p id={fieldErrorId("password")} className="text-sm font-medium text-destructive 2xl:text-base" role="alert">
                    {fieldErrors.password}
                  </p>
                ) : null}
              </div>

              <Button
                type="submit"
                disabled={busy}
                aria-busy={emailLoading || undefined}
                className={cn("h-11 min-h-11 w-full text-base 2xl:h-12 2xl:min-h-12 2xl:text-lg")}
              >
                {emailLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
                {emailLoading ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 text-center text-base text-muted-foreground 2xl:mt-8 2xl:text-lg">
              New to Nadi AI?{" "}
              <Link
                href="/onboarding"
                className="font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-sm"
              >
                Request onboarding
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
