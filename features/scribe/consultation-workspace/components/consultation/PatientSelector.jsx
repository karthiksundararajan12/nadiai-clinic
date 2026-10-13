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
      <span className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm font-semibold break-words text-emerald-800 min-[1920px]:text-base">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Consultation Locked
      </span>
    );
  }
  if (hasPatient) {
    return (
      <span className="shrink-0 rounded-full bg-[color:var(--scribe-indigo-50)] px-2.5 py-1 text-sm font-bold text-[color:var(--scribe-indigo-600)] min-[1920px]:text-base">
        Selected
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-900 min-[1920px]:text-base">
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
  compact = false,
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

  const handleUseExisting = (existing) => {
    onSelect?.({ ...existing, appointment_id: null });
  };

  const createModal = (
    <>
      <NewPatientModal
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={handleCreated}
        onUseExisting={handleUseExisting}
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

  const languageBlock = languageToggle && !compact ? (
    <div className="mt-4 space-y-2 border-t border-[color:var(--scribe-card-border)] pt-4 min-[1920px]:mt-6 min-[1920px]:pt-6">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex min-w-0 items-center gap-2 text-sm font-bold text-[color:var(--scribe-heading)] min-[1920px]:text-lg">
          <Globe size={20} weight="duotone" className="scribe-icon shrink-0" aria-hidden />
          Consultation Language
        </p>
        {lockSelection ? (
          <span className="scribe-text-muted inline-flex items-center gap-1 text-sm font-medium">
            <Lock size={16} weight="bold" className="scribe-icon shrink-0" aria-hidden />
            Locked during capture
          </span>
        ) : null}
      </div>
      <div className="min-w-0 w-full">{languageToggle}</div>
    </div>
  ) : null;

  if (compact) {
    const showEmpty = !patient && !loading && !loadError && !hasEligible;
    return (
      <div
        className={cn("flex w-full flex-col gap-2 bg-[color:var(--scribe-card-bg)] px-3 py-2", className)}
        data-testid={patient ? "scribe-patient-header" : "scribe-patient-compact"}
      >
        {showEmpty ? (
          <p className="text-sm font-medium text-[color:var(--scribe-heading)]" data-testid="scribe-patient-empty">
            No appointments today. Search a patient or add a new one.
          </p>
        ) : null}
        <div className="flex w-full items-center gap-2">
          {patient ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--scribe-indigo-600)] text-xs font-bold text-white">
                {initials(patient.name)}
              </div>
              <p className="min-w-0 flex-1 break-words text-sm font-bold text-[color:var(--scribe-heading)]">{patient.name}</p>
              {lockSelection ? (
                <span className="scribe-text-muted inline-flex shrink-0 items-center gap-1 text-sm font-semibold">
                  <Lock size={14} weight="bold" className="scribe-icon" aria-hidden />
                  Locked
                </span>
              ) : (
                <button
                  type="button"
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center whitespace-nowrap text-sm font-bold text-[color:var(--scribe-indigo-600)] hover:underline"
                  onClick={onClear}
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlass
                size={16}
                weight="bold"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 scribe-icon"
                aria-hidden
              />
              <select
                value={selectValue}
                onChange={handleSelectChange}
                disabled={loading || Boolean(loadError)}
                data-testid="scribe-patient-select"
                aria-label="Select patient to start consultation"
                aria-busy={loading || undefined}
                className={cn(
                  "h-10 min-h-10 w-full min-w-0 rounded-lg border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-indigo-50)] pl-9 pr-3 text-sm font-medium text-[color:var(--scribe-heading)] focus:outline-none focus:ring-2 focus:ring-[color:var(--scribe-indigo-100)]",
                  loading || loadError ? "cursor-not-allowed opacity-70" : "cursor-pointer",
                )}
              >
                <option value="">{loading ? "Loading patients…" : loadError ? "Unable to load appointments" : "Search a patient"}</option>
                {options.map((opt) => (
                  <option key={opt.appointment_id} value={opt.appointment_id}>
                    {optionLabel(opt)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={lockSelection}
            className="h-10 min-h-10 shrink-0 cursor-pointer gap-1.5 whitespace-nowrap border-transparent bg-[color:var(--scribe-indigo-50)] px-3 text-sm font-bold text-[color:var(--scribe-indigo-600)] hover:bg-[color:var(--scribe-indigo-100)]"
            data-testid="scribe-create-patient"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={16} weight="bold" aria-hidden />
            New patient
          </Button>
        </div>
        {loadError && (
          <p className="text-sm font-medium text-destructive" data-testid="scribe-patient-select-error">
            Couldn&apos;t load appointments. {loadError.message}{" "}
            <button type="button" className="underline" onClick={() => void loadEligible()}>
              Retry
            </button>
          </p>
        )}
        {createModal}
      </div>
    );
  }

  return (
    <div className={cn("w-full min-w-0 bg-[color:var(--scribe-card-bg)] px-4 py-4 md:px-5 min-[1920px]:px-6 min-[1920px]:py-6", className)} data-testid={patient ? "scribe-patient-header" : undefined}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2.5 text-sm font-bold text-[color:var(--scribe-heading)] min-[1920px]:text-lg">
          <span className="scribe-icon-tile h-9 w-9 shrink-0 min-[1920px]:h-11 min-[1920px]:w-11">
            <User size={22} weight="duotone" className="scribe-icon" aria-hidden />
          </span>
          Patient
        </p>
        <StatusBadge lockSelection={lockSelection} hasPatient={Boolean(patient)} />
      </div>

      <div className="flex flex-col">
        {patient ? (
          <div className={cn(
            "flex min-w-0 flex-wrap items-center gap-3 rounded-lg border px-3 py-3 sm:flex-nowrap",
            "border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-indigo-50)]",
          )}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--scribe-indigo-600)] text-sm font-bold text-white min-[1920px]:h-12 min-[1920px]:w-12 min-[1920px]:text-base">
              {initials(patient.name)}
            </div>
            <div className="min-w-0 flex-1 basis-[10rem]">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <p className="min-w-0 max-w-full truncate text-sm font-bold text-[color:var(--scribe-heading)] min-[1920px]:text-lg">{patient.name}</p>
                {patientIdTag(patient) ? (
                  <span className="max-w-full truncate rounded-full border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-card-bg)] px-1.5 py-0.5 font-mono text-sm font-semibold text-[color:var(--scribe-indigo-600)]">
                    {patientIdTag(patient)}
                  </span>
                ) : null}
              </div>
              {selectedMeta(patient) ? (
                <p className="scribe-text-muted truncate text-sm font-medium">{selectedMeta(patient)}</p>
              ) : null}
            </div>
            {lockSelection ? (
              <span className="scribe-text-muted inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md bg-[color:var(--scribe-card-bg)] px-2 py-1 text-sm font-semibold">
                <Lock size={16} weight="bold" className="scribe-icon" aria-hidden />
                Locked
              </span>
            ) : (
              <button
                type="button"
                className="inline-flex min-h-11 shrink-0 cursor-pointer items-center text-sm font-bold text-[color:var(--scribe-indigo-600)] hover:underline min-[1920px]:text-lg"
                onClick={onClear}
              >
                Change
              </button>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 w-full flex-1">
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
                    "h-11 min-h-11 w-full min-w-0 appearance-none truncate rounded-lg border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-indigo-50)] pl-9 pr-8 text-base font-medium text-[color:var(--scribe-heading)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[color:var(--scribe-indigo-100)] min-[1920px]:h-12 min-[1920px]:min-h-12 min-[1920px]:text-lg",
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
                className="h-11 min-h-11 w-full shrink-0 cursor-pointer gap-1.5 border-transparent bg-[color:var(--scribe-indigo-50)] text-sm font-bold text-[color:var(--scribe-indigo-600)] hover:bg-[color:var(--scribe-indigo-100)] sm:w-auto min-[1920px]:h-12 min-[1920px]:min-h-12 min-[1920px]:text-lg"
                data-testid="scribe-create-patient"
                onClick={() => setShowCreate(true)}
              >
                <Plus size={18} weight="bold" />
                <span className="sr-only">Create new patient</span>
                <span aria-hidden="true">New patient</span>
              </Button>
            </div>

            {loadError && (
              <p className="mt-2 break-words text-sm font-medium text-destructive" data-testid="scribe-patient-select-error">
                Couldn&apos;t load appointments. {loadError.message}{" "}
                <button type="button" className="inline-flex min-h-11 items-center underline" onClick={() => void loadEligible()}>
                  Retry
                </button>
              </p>
            )}

            <p className="mb-2 mt-4 text-sm font-bold uppercase tracking-wide text-[color:var(--scribe-heading)] min-[1920px]:text-base">
              Today&apos;s appointments ({options.length})
            </p>
            {hasEligible ? (
              <ul className="max-h-40 space-y-2 overflow-x-hidden overflow-y-auto md:max-h-52 lg:max-h-48 min-[1920px]:max-h-72">
                {options.map((opt) => (
                  <li key={opt.appointment_id} className="min-w-0">
                    <button
                      type="button"
                      className="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-lg border border-[color:var(--scribe-card-border)] px-2 py-2 text-left hover:bg-[color:var(--scribe-indigo-50)]"
                      onClick={() => onSelect?.(opt)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--scribe-indigo-100)] text-sm font-bold text-[color:var(--scribe-indigo-600)]">
                        {initials(opt.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[color:var(--scribe-heading)] min-[1920px]:text-lg">{opt.name}</span>
                        {appointmentMeta(opt) ? (
                          <span className="scribe-text-muted block truncate text-sm font-medium">{appointmentMeta(opt)}</span>
                        ) : null}
                      </span>
                      {slotTimeLabel(opt) ? (
                        <span className="scribe-text-muted max-w-[40%] shrink-0 truncate text-sm font-semibold">
                          {slotTimeLabel(opt)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : !loading && !loadError ? (
              <p className="scribe-text-muted break-words text-sm font-medium">No active appointments to consult</p>
            ) : null}
          </div>
        )}
      </div>

      {languageBlock}
      {createModal}
    </div>
  );
}
