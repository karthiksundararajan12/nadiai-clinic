"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Building,
  Loader2,
  Check,
  Stethoscope,
  MapPin,
  Phone,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SPECIALIZATIONS = [
  "General Physician",
  "Cardiologist",
  "Dermatologist",
  "Orthopedic",
  "Pediatrician",
  "Gynecologist",
  "ENT Specialist",
  "Neurologist",
  "Psychiatrist",
  "Ophthalmologist",
  "Dentist",
  "Other",
];

const STEP_HEADINGS = {
  1: "Tell us about you",
  2: "Set up your clinic",
};

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [specQuery, setSpecQuery] = useState("");
  const [user, setUser] = useState(null);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [form, setForm] = useState({
    full_name: "",
    specialization: "",
    license_number: "",
    phone: "",
    clinic_name: "",
    clinic_address: "",
    consultation_duration: "30",
    working_hours_start: "09:00",
    working_hours_end: "18:00",
  });

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        setForm((prev) => ({
          ...prev,
          full_name: user.user_metadata?.full_name || "",
        }));
      }
    };
    getUser();
  }, [supabase]);

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveProfile = async ({ redirect = true } = {}) => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          consultation_duration: parseInt(form.consultation_duration, 10) || 30,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      if (redirect) router.push("/dashboard");
      return data;
    } catch (err) {
      console.error("Failed to save profile:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
      return null;
    } finally {
      if (!redirect) setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaveError(null);
    const result = await saveProfile({ redirect: false });
    if (result) setFinished(true);
  };

  const canProceedStep1 = form.full_name && form.specialization && form.phone;
  const canProceedStep2 = form.clinic_name;
  const query = specQuery.trim().toLowerCase();
  const visibleSpecs = SPECIALIZATIONS.filter((spec) => {
    if (!query) return true;
    return spec.toLowerCase().includes(query) || spec === form.specialization;
  });

  const inputClass = "h-11 min-h-11 text-base 2xl:h-12 2xl:min-h-12 2xl:text-lg";

  return (
    <div className="min-h-dvh bg-background px-4 py-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-foreground 2xl:px-8 2xl:py-12 2xl:text-lg">
      <div className="mx-auto w-full max-w-md lg:max-w-xl 2xl:max-w-xl">
        <div className="mb-6 flex justify-center">
          <BrandLogo size="sm" showText />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-clinical)] sm:p-8 2xl:p-10">
          {finished ? (
            <div className="flex flex-col items-center px-2 py-8 text-center 2xl:py-12">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground 2xl:h-16 2xl:w-16">
                <Check className="h-7 w-7 2xl:h-8 2xl:w-8" aria-hidden />
              </span>
              <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-foreground 2xl:text-3xl">
                You&apos;re all set
              </h1>
              <p className="mt-2 max-w-sm text-base text-muted-foreground 2xl:text-lg">
                Your clinic profile is saved. Open the dashboard whenever you&apos;re ready.
              </p>
              <Button
                type="button"
                className="mt-8 h-11 min-h-11 w-full text-base 2xl:h-12 2xl:min-h-12 2xl:text-lg"
                onClick={() => router.push("/dashboard")}
              >
                Go to dashboard
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-6 2xl:mb-8">
                <p className="text-sm font-semibold text-primary 2xl:text-base">
                  Step {step} of 2
                </p>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={2}
                  aria-valuenow={step}
                  aria-label={`Step ${step} of 2`}
                >
                  <div
                    className={cn(
                      "h-full rounded-full bg-primary transition-all",
                      step === 1 ? "w-1/2" : "w-full",
                    )}
                  />
                </div>
                <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground 2xl:text-3xl">
                  {STEP_HEADINGS[step]}
                </h1>
              </div>

              {saveError ? (
                <div
                  className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3"
                  role="alert"
                  aria-live="assertive"
                >
                  <p className="text-base font-medium text-destructive">{saveError}</p>
                </div>
              ) : null}

              {step === 1 && (
                <div className="space-y-5 2xl:space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="full_name" className="text-base text-foreground 2xl:text-lg">
                      Full Name
                    </Label>
                    <Input
                      id="full_name"
                      placeholder="Dr. Your Name"
                      value={form.full_name}
                      autoComplete="name"
                      onChange={(e) => updateForm("full_name", e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="specialization-search" className="text-base text-foreground 2xl:text-lg">
                      Specialization
                    </Label>
                    <Input
                      id="specialization-search"
                      type="search"
                      placeholder="Search specializations"
                      value={specQuery}
                      onChange={(e) => setSpecQuery(e.target.value)}
                      className={inputClass}
                      aria-controls="specialization-list"
                    />
                    <div
                      id="specialization-list"
                      role="listbox"
                      aria-label="Specialization"
                      className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto overscroll-y-contain sm:grid-cols-2 2xl:max-h-80"
                    >
                      {visibleSpecs.map((spec) => {
                        const selected = form.specialization === spec;
                        return (
                          <button
                            key={spec}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => updateForm("specialization", spec)}
                            className={cn(
                              "min-h-11 rounded-lg border px-3 py-2 text-left text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring 2xl:min-h-12 2xl:text-lg",
                              selected
                                ? "border-primary bg-primary-soft text-primary"
                                : "border-border text-foreground hover:bg-muted",
                            )}
                          >
                            {spec}
                          </button>
                        );
                      })}
                    </div>
                    {visibleSpecs.length === 0 ? (
                      <p className="text-sm text-muted-foreground" role="status">
                        No matching specialization.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="license_number" className="text-base text-foreground 2xl:text-lg">
                      Medical License No.
                    </Label>
                    <div className="relative">
                      <Stethoscope className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input
                        id="license_number"
                        placeholder="MCI-XXXXXX"
                        value={form.license_number}
                        onChange={(e) => updateForm("license_number", e.target.value)}
                        className={cn(inputClass, "pl-9")}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground 2xl:text-base">
                      Optional now. Needed to show your registration number on prescriptions.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-base text-foreground 2xl:text-lg">
                      Phone Number
                    </Label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input
                        id="phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="+91 XXXXX XXXXX"
                        value={form.phone}
                        onChange={(e) => updateForm("phone", e.target.value)}
                        className={cn(inputClass, "pl-9")}
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5 2xl:space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="clinic_name" className="text-base text-foreground 2xl:text-lg">
                      Clinic / Hospital Name
                    </Label>
                    <div className="relative">
                      <Building className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input
                        id="clinic_name"
                        placeholder="Your Clinic Name"
                        value={form.clinic_name}
                        autoComplete="organization"
                        onChange={(e) => updateForm("clinic_name", e.target.value)}
                        className={cn(inputClass, "pl-9")}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clinic_address" className="text-base text-foreground 2xl:text-lg">
                      Address
                    </Label>
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
                      <textarea
                        id="clinic_address"
                        placeholder="Full clinic address"
                        value={form.clinic_address}
                        onChange={(e) => updateForm("clinic_address", e.target.value)}
                        rows={3}
                        className="flex min-h-24 w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-base font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring 2xl:text-lg"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-base text-foreground 2xl:text-lg">
                      Default Consultation Duration
                    </Label>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {["15", "20", "30", "45", "60"].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => updateForm("consultation_duration", d)}
                          aria-pressed={form.consultation_duration === d}
                          className={cn(
                            "min-h-11 rounded-lg border px-2 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring 2xl:min-h-12 2xl:text-lg",
                            form.consultation_duration === d
                              ? "border-primary bg-primary-soft text-primary"
                              : "border-border text-foreground hover:bg-muted",
                          )}
                        >
                          {d} min
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="working_hours_start" className="flex items-center gap-1.5 text-base text-foreground 2xl:text-lg">
                        <Clock className="h-4 w-4" aria-hidden />
                        Start Time
                      </Label>
                      <Input
                        id="working_hours_start"
                        type="time"
                        value={form.working_hours_start}
                        onChange={(e) => updateForm("working_hours_start", e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="working_hours_end" className="flex items-center gap-1.5 text-base text-foreground 2xl:text-lg">
                        <Clock className="h-4 w-4" aria-hidden />
                        End Time
                      </Label>
                      <Input
                        id="working_hours_end"
                        type="time"
                        value={form.working_hours_end}
                        onChange={(e) => updateForm("working_hours_end", e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between 2xl:mt-10">
                {step > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(step - 1)}
                    className="h-11 min-h-11 w-full gap-1.5 text-base sm:w-auto 2xl:h-12 2xl:min-h-12 2xl:text-lg"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Back
                  </Button>
                ) : (
                  <span className="hidden sm:block" />
                )}

                {step < 2 ? (
                  <Button
                    type="button"
                    onClick={() => setStep(step + 1)}
                    disabled={!canProceedStep1}
                    className="h-11 min-h-11 w-full text-base sm:w-auto 2xl:h-12 2xl:min-h-12 2xl:text-lg"
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !canProceedStep2}
                    aria-busy={saving || undefined}
                    className="h-11 min-h-11 w-full gap-1.5 text-base sm:w-auto 2xl:h-12 2xl:min-h-12 2xl:text-lg"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {saving ? "Setting up..." : "Finish setup"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
