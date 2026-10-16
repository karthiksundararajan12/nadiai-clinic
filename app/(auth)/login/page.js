"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, MessageCircle, Mic } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const BENEFITS = [
  { icon: MessageCircle, label: "WhatsApp booking" },
  { icon: Mic, label: "AI scribe with doctor approval" },
  { icon: FileText, label: "Prescriptions in one tap" },
];

function LoginLogo({ className }) {
  return (
    <Image
      src="/nadiai-header.png"
      alt="Nadi AI"
      width={694}
      height={258}
      priority
      className={`rounded-md ${className}`}
    />
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function LoginPage() {
  const t = useTranslations("auth");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onPageShow = (event) => {
      if (event.persisted) setLoading(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") !== "auth_failed") return undefined;
    const timer = window.setTimeout(() => {
      setError(t("signInFailed"));
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [t]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      });
      if (oauthError) throw oauthError;
      if (!data?.url) throw new Error(t("signInFailed"));
      window.location.replace(data.url);
    } catch (err) {
      setError(err.message || t("signInFailed"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground 2xl:text-lg">
      <div className="mx-auto flex min-h-dvh w-full flex-col lg:max-w-6xl lg:flex-row lg:px-6 lg:py-8 2xl:max-w-[1600px] 2xl:px-8 2xl:py-10">
        <aside className="hidden flex-col justify-between bg-primary px-10 py-12 text-primary-foreground lg:flex lg:w-[45%] lg:rounded-l-2xl 2xl:px-14 2xl:py-16">
          <LoginLogo className="h-14 w-auto self-center" />
          <div className="max-w-md">
            <h1 className="font-display text-4xl font-bold leading-[1.15] tracking-tight text-primary-foreground 2xl:text-5xl">Run your clinic on WhatsApp.</h1>
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
          <p className="border-t border-primary-foreground/25 pt-6 text-sm font-medium text-primary-foreground/80 2xl:text-base">DPDP Act 2023 compliant</p>
        </aside>
        <main className="flex flex-1 flex-col justify-center px-4 py-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:items-center lg:w-[55%] lg:rounded-r-2xl lg:border lg:border-l-0 lg:border-border lg:bg-card lg:px-12 lg:py-10 2xl:px-16">
          <div className="mb-8 flex w-full flex-col items-center sm:max-w-md lg:hidden">
            <LoginLogo className="h-10 w-auto sm:h-12" />
            <h1 className="mt-4 font-display text-2xl font-bold leading-tight tracking-tight text-foreground 2xl:text-3xl">Run your clinic on WhatsApp.</h1>
          </div>
          <div className="w-full sm:max-w-md">
            <div className="mb-6 2xl:mb-8">
              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground 2xl:text-3xl">Welcome back</h2>
              <p className="mt-2 text-base text-muted-foreground 2xl:text-lg">Sign in to your clinic dashboard</p>
            </div>
            {error ? (
              <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3" role="alert" aria-live="assertive">
                <p className="text-base font-medium text-destructive 2xl:text-lg">{error}</p>
              </div>
            ) : null}
            <Button type="button" onClick={handleGoogleLogin} disabled={loading} aria-busy={loading || undefined} className="h-11 min-h-11 w-full gap-3 text-base 2xl:h-12 2xl:min-h-12 2xl:text-lg">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-card"><GoogleIcon /></span>
              )}
              {loading ? t("signingIn") : t("continueWithGoogle")}
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
