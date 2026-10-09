"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Languages, Loader2, Lock, Plus, Search, User } from "lucide-react";
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
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Consultation Locked
      </span>
    );
  }
  if (hasPatient) {
    return (
      <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        Selected
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
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
    <div className="mt-4 space-y-2 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Languages className="h-3.5 w-3.5 text-primary" aria-hidden />
          Consultation Language
        </p>
        {lockSelection ? (
          <span className="inline-flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300">
            <Lock className="h-3 w-3" aria-hidden />
            Locked during capture
          </span>
        ) : null}
      </div>
      {languageToggle}
    </div>
  ) : null;

  return (
    <div className={cn("w-full bg-card px-4 py-4", className)} data-testid={patient ? "scribe-patient-header" : undefined}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-heading">
          <User className="h-4 w-4 text-primary" aria-hidden />
          Patient
        </p>
        <StatusBadge lockSelection={lockSelection} hasPatient={Boolean(patient)} />
      </div>

      <div className="flex flex-col">
        {patient ? (
          <div className={cn(
            "flex items-center gap-3 rounded-lg border px-3 py-3",
            lockSelection ? "border-border bg-muted/60" : "border-primary/15 bg-primary/10",
          )}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials(patient.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-semibold text-heading">{patient.name}</p>
                {patientIdTag(patient) ? (
                  <span className="shrink-0 rounded-full border border-primary/20 bg-card px-1.5 py-0.5 font-mono text-xs font-medium text-primary">
                    {patientIdTag(patient)}
                  </span>
                ) : null}
              </div>
              {selectedMeta(patient) ? (
                <p className="truncate text-xs text-gray-700 dark:text-gray-300">{selectedMeta(patient)}</p>
              ) : null}
            </div>
            {lockSelection ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-card px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                <Lock className="h-3 w-3" aria-hidden />
                Locked
              </span>
            ) : (
              <button
                type="button"
                className="shrink-0 cursor-pointer text-xs font-semibold text-primary hover:underline"
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
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
                <select
                  value={selectValue}
                  onChange={handleSelectChange}
                  disabled={selectDisabled}
                  data-testid="scribe-patient-select"
                  aria-label="Select patient to start consultation"
                  aria-busy={loading || undefined}
                  className={cn(
                    "h-10 w-full appearance-none rounded-lg border border-border bg-muted/40 pl-9 pr-8 text-xs text-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30",
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
                  <Loader2
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-500"
                    aria-hidden
                  />
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 cursor-pointer gap-1 border-transparent bg-primary/10 text-xs text-primary hover:bg-primary/15"
                data-testid="scribe-create-patient"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="sr-only">Create new patient</span>
                <span aria-hidden="true">New patient</span>
              </Button>
            </div>

            {loadError && (
              <p className="mt-2 text-xs text-destructive" data-testid="scribe-patient-select-error">
                Couldn&apos;t load appointments. {loadError.message}{" "}
                <button type="button" className="underline" onClick={() => void loadEligible()}>
                  Retry
                </button>
              </p>
            )}

            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
              Today&apos;s appointments ({options.length})
            </p>
            {hasEligible ? (
              <ul className="max-h-40 space-y-2 overflow-y-auto">
                {options.map((opt) => (
                  <li key={opt.appointment_id}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border px-2 py-2 text-left hover:bg-muted"
                      onClick={() => onSelect?.(opt)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials(opt.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-heading">{opt.name}</span>
                        {appointmentMeta(opt) ? (
                          <span className="block truncate text-xs text-gray-700 dark:text-gray-300">{appointmentMeta(opt)}</span>
                        ) : null}
                      </span>
                      {slotTimeLabel(opt) ? (
                        <span className="shrink-0 text-xs font-medium text-gray-700 dark:text-gray-300">
                          {slotTimeLabel(opt)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : !loading && !loadError ? (
              <p className="text-xs text-gray-700 dark:text-gray-300">No active appointments to consult</p>
            ) : null}
          </div>
        )}
      </div>

      {languageBlock}
      {createModal}
    </div>
  );
}
