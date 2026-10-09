"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleNotch,
  Globe,
  Lock,
  MagnifyingGlass,
  Plus,
  User,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { fetchEligibleConsultationPatients } from "../../services/patient.client.js";
import { NewPatientModal } from "./NewPatientModal.jsx";

function initials(name) {
  return (name ?? "P").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function optionLabel(patient) {
  const slot = patient.slot_label ? ` · ${patient.slot_label}` : "";
  return `${patient.name}${slot}`;
}

function personMeta(patient) {
  const gender = patient.gender || null;
  const age = patient.age != null && patient.age !== "" ? `${patient.age}y` : null;
  return [gender, age].filter(Boolean).join(", ");
}

function visitReason(patient) {
  const value = patient?.reason ?? patient?.visit_reason ?? patient?.chief_complaint ?? null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function appointmentMeta(patient) {
  return [personMeta(patient), visitReason(patient)].filter(Boolean).join(" • ");
}

function slotTimeLabel(patient) {
  const label = patient?.slot_label;
  if (typeof label === "string" && label.includes(",")) {
    const time = label.split(",").pop()?.trim();
    if (time) return time;
  }
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

function isSlotToday(slotStart) {
  if (!slotStart) return false;
  const start = new Date(slotStart);
  if (Number.isNaN(start.getTime())) return false;
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return format.format(start) === format.format(new Date());
}

function slotPhrase(patient) {
  const time = slotTimeLabel(patient);
  if (!time) return null;
  if (isSlotToday(patient.slot_start)) return `Today, ${time}`;
  return patient.slot_label || time;
}

function selectedMeta(patient) {
  const slot = slotPhrase(patient);
  return [personMeta(patient), slot ? `Slot: ${slot}` : null].filter(Boolean).join(" • ");
}

function patientIdTag(patient) {
  if (!patient?.id) return null;
  return `MRN-${String(patient.id).slice(0, 8).toUpperCase()}`;
}

function StatusBadge({ lockSelection, hasPatient }) {
  if (lockSelection) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Consultation Locked
      </span>
    );
  }
  if (hasPatient) {
    return (
      <span className="shrink-0 rounded-full bg-[color:var(--scribe-indigo-50)] px-2.5 py-1 text-sm font-bold text-[color:var(--scribe-indigo-600)]">
        Selected
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-900">
      Required
    </span>
  );
}

export function PatientSelector({
  patient,
  onSelect,
  onClear,
  className,
  lockSelection = false,
  languageToggle = null,
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);

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

  const handleCreated = (created) => {
    onSelect?.({ ...created, appointment_id: null });
    setToast({ message: "Patient saved", variant: "default" });
    void loadEligible();
  };

  const createModal = (
    <>
      <NewPatientModal
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={handleCreated}
        onError={(message) => setToast({ message, variant: "error" })}
      />
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
          <Toast
            message={toast.message}
            variant={toast.variant}
            onDismiss={() => setToast(null)}
          />
        </div>
      ) : null}
    </>
  );

  const hasEligible = options.length > 0;
  const selectDisabled = loading || Boolean(loadError) || !hasEligible;
  const placeholder = loading
    ? "Loading patients…"
    : loadError
      ? "Unable to load appointments"
      : hasEligible
        ? "Search patient"
        : "No active appointments to consult";

  const languageBlock = languageToggle ? (
    <div className="mt-4 space-y-2 border-t border-[color:var(--scribe-card-border)] pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-[color:var(--scribe-heading)]">
          <Globe size={20} weight="duotone" className="scribe-icon" aria-hidden />
          Consultation Language
        </p>
        {lockSelection ? (
          <span className="scribe-text-muted inline-flex items-center gap-1 text-sm font-medium">
            <Lock size={16} weight="bold" className="scribe-icon" aria-hidden />
            Locked during capture
          </span>
        ) : null}
      </div>
      {languageToggle}
    </div>
  ) : null;

  return (
    <div className={cn("w-full bg-[color:var(--scribe-card-bg)] px-4 py-4", className)} data-testid={patient ? "scribe-patient-header" : undefined}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 text-sm font-bold text-[color:var(--scribe-heading)]">
          <span className="scribe-icon-tile h-9 w-9">
            <User size={22} weight="duotone" className="scribe-icon" aria-hidden />
          </span>
          Patient
        </p>
        <StatusBadge lockSelection={lockSelection} hasPatient={Boolean(patient)} />
      </div>

      <div className="flex flex-col">
        {patient ? (
          <div className={cn(
            "flex items-center gap-3 rounded-lg border px-3 py-3",
            lockSelection
              ? "border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-indigo-50)]"
              : "border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-indigo-50)]",
          )}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--scribe-indigo-600)] text-sm font-bold text-white">
              {initials(patient.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-bold text-[color:var(--scribe-heading)]">{patient.name}</p>
                {patientIdTag(patient) ? (
                  <span className="shrink-0 rounded-full border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-card-bg)] px-1.5 py-0.5 font-mono text-sm font-semibold text-[color:var(--scribe-indigo-600)]">
                    {patientIdTag(patient)}
                  </span>
                ) : null}
              </div>
              {selectedMeta(patient) ? (
                <p className="scribe-text-muted truncate text-sm font-medium">{selectedMeta(patient)}</p>
              ) : null}
            </div>
            {lockSelection ? (
              <span className="scribe-text-muted inline-flex shrink-0 items-center gap-1 rounded-md bg-[color:var(--scribe-card-bg)] px-2 py-1 text-sm font-semibold">
                <Lock size={16} weight="bold" className="scribe-icon" aria-hidden />
                Locked
              </span>
            ) : (
              <button
                type="button"
                className="shrink-0 cursor-pointer text-sm font-bold text-[color:var(--scribe-indigo-600)] hover:underline"
                onClick={onClear}
              >
                Change
              </button>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <MagnifyingGlass
                  size={18}
                  weight="bold"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 scribe-icon"
                  aria-hidden
                />
                <select
                  value={selectValue}
                  onChange={handleSelectChange}
                  disabled={selectDisabled}
                  data-testid="scribe-patient-select"
                  aria-label="Select patient to start consultation"
                  aria-busy={loading || undefined}
                  className={cn(
                    "h-10 w-full appearance-none rounded-lg border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-indigo-50)] pl-9 pr-8 text-sm font-medium text-[color:var(--scribe-heading)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[color:var(--scribe-indigo-100)]",
                    selectDisabled
                      ? loading
                        ? "cursor-wait opacity-70"
                        : "cursor-not-allowed opacity-70"
                      : "cursor-pointer",
                  )}
                >
                  <option value="">{placeholder}</option>
                  {options.map((opt) => (
                    <option key={opt.appointment_id} value={opt.appointment_id}>
                      {optionLabel(opt)}
                    </option>
                  ))}
                </select>
                {loading && (
                  <CircleNotch
                    size={18}
                    weight="bold"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin scribe-icon"
                    aria-hidden
                  />
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 cursor-pointer gap-1.5 border-transparent bg-[color:var(--scribe-indigo-50)] text-sm font-bold text-[color:var(--scribe-indigo-600)] hover:bg-[color:var(--scribe-indigo-100)]"
                data-testid="scribe-create-patient"
                onClick={() => setShowCreate(true)}
              >
                <Plus size={18} weight="bold" />
                <span className="sr-only">Create new patient</span>
                <span aria-hidden="true">New patient</span>
              </Button>
            </div>

            {loadError && (
              <p className="mt-2 text-sm font-medium text-destructive" data-testid="scribe-patient-select-error">
                Couldn&apos;t load appointments. {loadError.message}{" "}
                <button type="button" className="underline" onClick={() => void loadEligible()}>
                  Retry
                </button>
              </p>
            )}

            <p className="mb-2 mt-4 text-sm font-bold uppercase tracking-wide text-[color:var(--scribe-heading)]">
              Today&apos;s appointments ({options.length})
            </p>
            {hasEligible ? (
              <ul className="max-h-40 space-y-2 overflow-y-auto">
                {options.map((opt) => (
                  <li key={opt.appointment_id}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-[color:var(--scribe-card-border)] px-2 py-2 text-left hover:bg-[color:var(--scribe-indigo-50)]"
                      onClick={() => onSelect?.(opt)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--scribe-indigo-100)] text-sm font-bold text-[color:var(--scribe-indigo-600)]">
                        {initials(opt.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[color:var(--scribe-heading)]">{opt.name}</span>
                        {appointmentMeta(opt) ? (
                          <span className="scribe-text-muted block truncate text-sm font-medium">{appointmentMeta(opt)}</span>
                        ) : null}
                      </span>
                      {slotTimeLabel(opt) ? (
                        <span className="scribe-text-muted shrink-0 text-sm font-semibold">
                          {slotTimeLabel(opt)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : !loading && !loadError ? (
              <p className="scribe-text-muted text-sm font-medium">No active appointments to consult</p>
            ) : null}
          </div>
        )}
      </div>

      {languageBlock}
      {createModal}
    </div>
  );
}
