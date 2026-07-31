"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  createPatient,
  fetchEligibleConsultationPatients,
} from "../../services/patient.client.js";

function initials(name) {
  return (name ?? "P").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return days;
}

function optionLabel(patient) {
  const slot = patient.slot_label ? ` · ${patient.slot_label}` : "";
  return `${patient.name}${slot}`;
}

export function PatientSelector({ patient, onSelect, onClear, className }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", age: "", gender: "Male" });

  const loadEligible = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setOptions(await fetchEligibleConsultationPatients());
    } catch (err) {
      setOptions([]);
      setLoadError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEligible();
  }, [loadEligible]);

  const selectValue = useMemo(() => {
    if (!patient?.appointment_id) return "";
    return options.some((opt) => opt.appointment_id === patient.appointment_id)
      ? patient.appointment_id
      : "";
  }, [options, patient?.appointment_id]);

  const handleSelectChange = (event) => {
    const appointmentId = event.target.value;
    if (!appointmentId) {
      onClear?.();
      return;
    }
    const selected = options.find((opt) => opt.appointment_id === appointmentId);
    if (selected) onSelect?.(selected);
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.phone.trim()) return;
    setCreating(true);
    try {
      const created = await createPatient(form);
      onSelect?.({ ...created, appointment_id: null });
      setShowCreate(false);
      setForm({ name: "", phone: "", age: "", gender: "Male" });
    } finally {
      setCreating(false);
    }
  };

  if (patient) {
    const days = daysSince(patient.last_visit);
    return (
      <div className={cn("flex w-full flex-col gap-3 border-b border-gray-200 bg-white px-6 py-3", className)}>
        <PatientStepLabel />
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials(patient.name)}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{patient.name}</p>
              <p className="text-xs text-gray-600">
                {[
                  patient.age ? `${patient.age} yrs` : null,
                  patient.gender,
                  patient.phone,
                  patient.slot_label,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            {days != null && (
              <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600">
                Last seen {days === 0 ? "today" : `${days} days ago`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="cursor-pointer rounded-lg border border-gray-200 p-2 transition-all duration-200 hover:bg-gray-50" onClick={onClear} aria-label="Clear patient">
              <X className="h-4 w-4 text-gray-500" />
            </button>
            <button type="button" className="cursor-pointer flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs transition-all duration-200 hover:bg-white" onClick={() => setShowCreate(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              New patient
            </button>
          </div>
        </div>
        {showCreate && <CreatePanel form={form} setForm={setForm} creating={creating} onCreate={handleCreate} onClose={() => setShowCreate(false)} />}
      </div>
    );
  }

  return (
    <div className={cn("relative w-full border-b border-gray-200 bg-white px-6 py-4", className)}>
      <PatientStepLabel />
      <div className="relative mt-3 max-w-xl">
        <select
          value={selectValue}
          onChange={handleSelectChange}
          disabled={loading}
          data-testid="scribe-patient-select"
          aria-label="Select patient to start consultation"
          className="h-10 w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-3 pr-8 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-wait disabled:opacity-70"
        >
          <option value="">
            {loading ? "Loading patients…" : "Select patient to start consultation"}
          </option>
          {options.map((opt) => (
            <option key={opt.appointment_id} value={opt.appointment_id}>
              {optionLabel(opt)}
            </option>
          ))}
        </select>
        {loading && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>

      {loadError && (
        <p className="mt-2 text-xs text-destructive">
          {loadError.message}{" "}
          <button type="button" className="underline" onClick={() => void loadEligible()}>
            Retry
          </button>
        </p>
      )}

      {!loading && !loadError && options.length === 0 && (
        <p className="mt-2 text-xs text-gray-500">
          No confirmed appointments waiting for consultation. Create a walk-in patient below, or confirm an appointment first.
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="xs"
        className="mt-2 gap-1"
        onClick={() => setShowCreate(true)}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Create new patient
      </Button>
      {showCreate && <CreatePanel form={form} setForm={setForm} creating={creating} onCreate={handleCreate} onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function PatientStepLabel() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
        1
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">Patient</span>
    </div>
  );
}

function CreatePanel({ form, setForm, creating, onCreate, onClose }) {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Full Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Phone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Age *" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
        <select className="rounded border border-gray-200 px-3 py-2 text-sm" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
          <option>Male</option>
          <option>Female</option>
          <option>Other</option>
        </select>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50" disabled={creating} onClick={onCreate}>
          {creating ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null}
          Create and Attach
        </button>
        <button type="button" className="cursor-pointer rounded-lg border border-gray-200 px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
