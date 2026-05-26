"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Activity,
  ArrowRight,
  ArrowLeft,
  User,
  Building,
  Loader2,
  Check,
  Stethoscope,
  MapPin,
  Phone,
  Clock,
} from "lucide-react";

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

const STEPS = [
  { id: 1, title: "Personal Info", icon: User, desc: "Tell us about yourself" },
  { id: 2, title: "Clinic Setup", icon: Building, desc: "Set up your practice" },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
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

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("doctor_profiles").upsert(
        {
          user_id: user.id,
          email: user.email,
          ...form,
          consultation_duration: parseInt(form.consultation_duration),
          onboarding_complete: true,
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      router.push("/dashboard");
    } catch (err) {
      console.error("Failed to save profile:", err);
      setSaving(false);
    }
  };

  const canProceedStep1 = form.full_name && form.specialization && form.phone;
  const canProceedStep2 = form.clinic_name;

  return (
    <div className="flex min-h-screen flex-col items-center bg-background">
      {/* Header */}
      <div className="w-full border-b border-border bg-card/50 glass">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Nadi AI</p>
              <p className="text-[11px] text-muted-foreground">
                Doctor Onboarding
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {STEPS.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    step > s.id
                      ? "bg-primary text-primary-foreground"
                      : step === s.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step > s.id ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    s.id
                  )}
                </div>
                {s.id < STEPS.length && (
                  <div
                    className={`h-px w-8 ${
                      step > s.id ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-2xl px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            {(() => {
              const StepIcon = STEPS[step - 1].icon;
              return (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <StepIcon className="h-5 w-5 text-primary" />
                </div>
              );
            })()}
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {STEPS[step - 1].title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {STEPS[step - 1].desc}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Step {step} of {STEPS.length} &middot; Takes less than 2 minutes
          </p>
        </div>

        {step === 1 && (
          <div className="space-y-5 animate-in fade-in-50 slide-in-from-right-5 duration-300">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                placeholder="Dr. Your Name"
                value={form.full_name}
                onChange={(e) => updateForm("full_name", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Specialization *</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {SPECIALIZATIONS.map((spec) => (
                  <button
                    key={spec}
                    onClick={() => updateForm("specialization", spec)}
                    className={`flex items-center justify-center rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${
                      form.specialization === spec
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {spec}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Medical License No.</Label>
                <div className="relative">
                  <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="MCI-XXXXXX"
                    value={form.license_number}
                    onChange={(e) =>
                      updateForm("license_number", e.target.value)
                    }
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Phone Number *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="+91 XXXXX XXXXX"
                    value={form.phone}
                    onChange={(e) => updateForm("phone", e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 animate-in fade-in-50 slide-in-from-right-5 duration-300">
            <div className="space-y-2">
              <Label>Clinic / Hospital Name *</Label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Your Clinic Name"
                  value={form.clinic_name}
                  onChange={(e) => updateForm("clinic_name", e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <textarea
                  placeholder="Full clinic address"
                  value={form.clinic_address}
                  onChange={(e) =>
                    updateForm("clinic_address", e.target.value)
                  }
                  rows={2}
                  className="flex w-full rounded-lg border border-input bg-transparent pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Default Consultation Duration</Label>
              <div className="flex gap-2">
                {["15", "20", "30", "45", "60"].map((d) => (
                  <button
                    key={d}
                    onClick={() => updateForm("consultation_duration", d)}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${
                      form.consultation_duration === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Start Time
                </Label>
                <Input
                  type="time"
                  value={form.working_hours_start}
                  onChange={(e) =>
                    updateForm("working_hours_start", e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  End Time
                </Label>
                <Input
                  type="time"
                  value={form.working_hours_end}
                  onChange={(e) =>
                    updateForm("working_hours_end", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mt-2">
              <p className="text-sm font-medium text-foreground">
                You&apos;re all set!
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                You can always update these settings later from the Settings
                page. Let&apos;s get you started with Nadi AI.
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
          {step > 1 ? (
            <Button
              variant="ghost"
              onClick={() => setStep(step - 1)}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < STEPS.length ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceedStep1}
              className="gap-1.5"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saving || !canProceedStep2}
              className="gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  Complete Setup
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
