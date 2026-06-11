"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Shield, Mic, CalendarDays, ArrowRight, Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const FEATURES = [
  {
    icon: Mic,
    title: "AI Scribe",
    desc: "Hinglish voice transcription with auto clinical notes",
  },
  {
    icon: CalendarDays,
    title: "Smart Scheduling",
    desc: "Manage appointments and patient visits in one place",
  },
  {
    icon: Shield,
    title: "HIPAA Ready",
    desc: "Enterprise-grade security for patient data",
  },
];

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
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

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message || "Failed to sign in. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel — branding */}
      <div className="relative hidden w-1/2 lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0a2520] via-[#0d3530] to-[#0a1f1c] p-12 text-white">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative z-10">
          <Image
            src="/logo.png"
            alt="Nadi AI"
            width={380}
            height={207}
            className="h-24 w-auto object-contain"
          />
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-bold leading-[1.15] tracking-tight mb-6">
            The AI assistant
            <br />
            <span className="text-primary">doctors trust</span>
          </h2>
          <p className="text-base text-white/60 leading-relaxed mb-10">
            Transform your practice with AI-powered clinical documentation
            and seamless patient management — all in Hinglish.
          </p>

          <div className="space-y-5">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/90">
                    {f.title}
                  </p>
                  <p className="text-sm text-white/40 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 border-t border-white/10 pt-6">
            <div className="flex -space-x-2">
              {["AM", "RK", "PS"].map((initials, i) => (
                <div
                  key={i}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0d3530] bg-primary/20 text-[10px] font-semibold text-primary"
                >
                  {initials}
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-medium text-white/70">
                Trusted by 500+ doctors
              </p>
              <p className="text-[11px] text-white/40">
                Across 50+ clinics in India
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="mb-10 lg:hidden">
            <Image
              src="/logo.png"
              alt="Nadi AI"
              width={160}
              height={44}
              className="h-11 w-auto object-contain"
            />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              Welcome back
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Sign in to access your clinical dashboard
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="group flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-muted hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <GoogleIcon />
            )}
            {loading ? "Signing in..." : "Continue with Google"}
            {!loading && (
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
            )}
          </button>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground">
                Secure authentication via Supabase
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Your data is secure
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  We use enterprise-grade encryption and never share your
                  patient data. HIPAA-compliant infrastructure.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            By signing in, you agree to our{" "}
            <a href="#" className="text-primary hover:underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="text-primary hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
