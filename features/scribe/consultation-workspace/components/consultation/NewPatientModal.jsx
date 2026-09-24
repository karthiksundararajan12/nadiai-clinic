"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPatient } from "../../services/patient.client.js";

export const EMPTY_NEW_PATIENT_FORM = {
  name: "",
  phone: "",
  age: "",
  gender: "Male",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Same client payload the inline form posted: the raw form fields.
 * Phone normalization and age/DOB checks stay on POST /api/patients.
 */
export function buildNewPatientPayload(form) {
  return {
    name: form.name,
    phone: form.phone,
    age: form.age,
    gender: form.gender,
  };
}

export function validateNewPatientForm(form) {
  const errors = {};
  if (!String(form.name ?? "").trim()) {
    errors.name = "Full name is required";
  }
  if (!String(form.phone ?? "").trim()) {
    errors.phone = "Phone number is required";
  }
  return errors;
}

export function isNewPatientFormDirty(form) {
  return (
    form.name !== EMPTY_NEW_PATIENT_FORM.name ||
    form.phone !== EMPTY_NEW_PATIENT_FORM.phone ||
    form.age !== EMPTY_NEW_PATIENT_FORM.age ||
    form.gender !== EMPTY_NEW_PATIENT_FORM.gender
  );
}

/**
 * @param {{
 *   open: boolean;
 *   onOpenChange: (open: boolean) => void;
 *   onCreated: (patient: object) => void;
 *   onError?: (message: string) => void;
 * }} props
 */
export function NewPatientModal({ open, onOpenChange, onCreated, onError }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const nameRef = useRef(null);
  const submittingRef = useRef(false);
  const [form, setForm] = useState(EMPTY_NEW_PATIENT_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_NEW_PATIENT_FORM);
      setErrors({});
      setFormError("");
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      nameRef.current?.focus();
    });

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!submittingRef.current) onOpenChange(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function requestClose({ confirmIfDirty }) {
    if (submittingRef.current) return;
    if (confirmIfDirty && isNewPatientFormDirty(form)) {
      const discard = window.confirm("Discard unsaved patient details?");
      if (!discard) return;
    }
    onOpenChange(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;

    const nextErrors = validateNewPatientForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    submittingRef.current = true;
    setSubmitting(true);
    setFormError("");
    try {
      const created = await createPatient(buildNewPatientPayload(form));
      onCreated?.(created);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
      onError?.(message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-foreground/40 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={() => requestClose({ confirmIfDirty: true })}
        data-testid="new-patient-modal-overlay"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-testid="new-patient-modal"
        className={cn(
          "relative z-50 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-md",
          "animate-in fade-in-0 zoom-in-95 duration-200",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="font-display text-heading leading-none tracking-tight text-card-foreground">
              New patient
            </h2>
            <p id={descriptionId} className="text-caption font-medium text-muted-foreground">
              Add a patient to start a consultation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => requestClose({ confirmIfDirty: false })}
            className="rounded-lg p-1 text-muted-foreground opacity-70 ring-offset-background transition-opacity hover:bg-primary-soft hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="Close"
            disabled={submitting}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="mt-5" onSubmit={handleSubmit} noValidate>
          {formError ? (
            <p className="mb-4 text-caption font-medium text-destructive" role="alert" data-testid="new-patient-form-error">
              {formError}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-patient-name">Full name</Label>
              <Input
                ref={nameRef}
                id="new-patient-name"
                value={form.name}
                disabled={submitting}
                autoComplete="name"
                aria-invalid={Boolean(errors.name) || undefined}
                aria-describedby={errors.name ? "new-patient-name-error" : undefined}
                className="focus-visible:ring-primary/40 focus-visible:border-primary"
                onChange={(event) => updateField("name", event.target.value)}
              />
              {errors.name ? (
                <p id="new-patient-name-error" className="text-caption font-medium text-destructive">
                  {errors.name}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-patient-phone">Phone</Label>
              <Input
                id="new-patient-phone"
                type="tel"
                value={form.phone}
                disabled={submitting}
                autoComplete="tel"
                placeholder="+91 98765 43210"
                aria-invalid={Boolean(errors.phone) || undefined}
                aria-describedby={errors.phone ? "new-patient-phone-error" : undefined}
                className="focus-visible:ring-primary/40 focus-visible:border-primary"
                onChange={(event) => updateField("phone", event.target.value)}
              />
              {errors.phone ? (
                <p id="new-patient-phone-error" className="text-caption font-medium text-destructive">
                  {errors.phone}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-patient-age">Age</Label>
              <Input
                id="new-patient-age"
                inputMode="numeric"
                value={form.age}
                disabled={submitting}
                aria-invalid={Boolean(errors.age) || undefined}
                aria-describedby={errors.age ? "new-patient-age-error" : undefined}
                className="focus-visible:ring-primary/40 focus-visible:border-primary"
                onChange={(event) => updateField("age", event.target.value)}
              />
              {errors.age ? (
                <p id="new-patient-age-error" className="text-caption font-medium text-destructive">
                  {errors.age}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-patient-gender">Gender</Label>
              <select
                id="new-patient-gender"
                value={form.gender}
                disabled={submitting}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-body font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(event) => updateField("gender", event.target.value)}
              >
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => requestClose({ confirmIfDirty: false })}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save patient
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
