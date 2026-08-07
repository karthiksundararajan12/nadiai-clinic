"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button, buttonVariants } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { loadDrugNames } from "@/lib/drug-names";
import {
  hasDoctorRegistrationNumber,
  MISSING_DOCTOR_REGISTRATION_MESSAGE,
  SETTINGS_HREF,
} from "@/features/scribe/lib/prescription-registration-gate.js";
import { isAiSuggestedMedication } from "@/features/scribe/lib/prescription-medication-suggestions.js";
import {
  PRESCRIPTION_DURATION_PRESETS,
  PRESCRIPTION_FREQUENCY_OPTIONS,
  dosePresetsForMedicine,
} from "@/features/scribe/lib/prescription-field-ranges.js";
import { PrescriptionFieldChips } from "./PrescriptionFieldChips.jsx";

export { PRESCRIPTION_FREQUENCY_OPTIONS };

const FOOD_OPTIONS = [
  { value: "before food", label: "Before food" },
  { value: "after food", label: "After food" },
];

/** Session-scoped drug list cache is in lib/drug-names.js; this tracks load state for UI. */
let drugNamesWarm = false;

export function PrescriptionDraftPanel({
  draft,
  patient,
  doctor,
  approving,
  approvalError,
  onApprove,
  onDiscard,
  onAddMedication,
  onUpdateMedication,
  onRemoveMedication,
  onUpdateAdvice,
  onUpdateFollowUpDays,
  onUpdateDiagnosis,
  onUpdateInvestigations,
}) {
  const patientLabel = [
    patient?.name ?? "Patient",
    patient?.age != null ? `${patient.age}yr` : null,
    patient?.gender ?? null,
  ].filter(Boolean).join(" · ");

  const adviceText = Array.isArray(draft.advice) ? draft.advice.join("\n") : "";
  const diagnosisText = Array.isArray(draft.diagnosis) ? draft.diagnosis.join("\n") : "";
  const investigationsText = Array.isArray(draft.investigations)
    ? draft.investigations.join("\n")
    : "";

  const registrationMissing = !hasDoctorRegistrationNumber(doctor);
  const gateMessage =
    approvalError?.message ||
    (doctor != null && registrationMissing
      ? MISSING_DOCTOR_REGISTRATION_MESSAGE
      : null);

  const [drugNames, setDrugNames] = useState(/** @type {ReadonlyArray<string>} */ ([]));
  const [drugNamesLoading, setDrugNamesLoading] = useState(false);

  const ensureDrugNamesLoaded = () => {
    if (drugNamesWarm || drugNamesLoading) return;
    setDrugNamesLoading(true);
    void loadDrugNames()
      .then((names) => {
        drugNamesWarm = true;
        setDrugNames(names);
      })
      .catch(() => {
        // Combobox still works as free-text without suggestions.
      })
      .finally(() => setDrugNamesLoading(false));
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="prescription-draft-panel">
      <div className="flex shrink-0 items-start justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Prescription Draft</h2>
          <p className="text-xs text-gray-500">{patientLabel}</p>
          <p className="text-xs text-gray-500">
            {new Date().toLocaleDateString("en-IN", { dateStyle: "medium" })}
          </p>
        </div>
        <button
          type="button"
          onClick={onApprove}
          disabled={approving}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white",
            "bg-primary transition-all duration-200 hover:bg-primary/90 disabled:opacity-60",
          )}
          data-testid="prescription-approve-header"
        >
          {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Approve Prescription
        </button>
      </div>

      {gateMessage ? (
        <div
          className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          data-testid="prescription-registration-gate"
          role="alert"
        >
          <p className="font-medium">{gateMessage}</p>
          <Link
            href={SETTINGS_HREF}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "mt-2 inline-flex border-amber-300 bg-white text-amber-950 hover:bg-amber-100",
            )}
          >
            Open Settings
          </Link>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <section>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Diagnosis / Chief Complaint
            </label>
            <Textarea
              value={diagnosisText}
              onChange={(e) => onUpdateDiagnosis?.(e.target.value)}
              placeholder="From SOAP Assessment — edit if needed"
              className="min-h-[72px] text-sm"
              data-testid="prescription-diagnosis"
            />
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Rx</h3>
            <div className="space-y-3">
              {(draft.medications ?? []).map((med, index) => (
                <MedicationFields
                  key={index}
                  med={med}
                  index={index}
                  drugNames={drugNames}
                  drugNamesLoading={drugNamesLoading}
                  onFocusDrugName={ensureDrugNamesLoaded}
                  onUpdate={onUpdateMedication}
                  onRemove={onRemoveMedication}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onAddMedication}
              className="mt-3 cursor-pointer text-sm font-medium text-primary hover:text-primary/90"
            >
              + Add Medicine
            </button>
          </section>

          <section>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Advice &amp; Instructions
            </label>
            <Textarea
              value={adviceText}
              onChange={(e) => onUpdateAdvice(e.target.value)}
              placeholder="Rest, fluids, dietary advice…"
              className="min-h-[100px] text-sm"
              data-testid="prescription-advice"
            />
          </section>

          <section>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Investigations advised
              <span className="ml-1 font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <Textarea
              value={investigationsText}
              onChange={(e) => onUpdateInvestigations?.(e.target.value)}
              placeholder="CBC, chest X-ray…"
              className="min-h-[72px] text-sm"
              data-testid="prescription-investigations"
            />
          </section>

          <section className="flex items-center gap-2 text-sm text-gray-700">
            <span>Follow-up in</span>
            <Input
              type="number"
              min={1}
              className="w-20 text-sm"
              value={draft.followUpDays ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onUpdateFollowUpDays(val ? Number(val) : undefined);
              }}
            />
            <span>days</span>
          </section>
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-gray-200 px-4 py-4">
        <Button
          type="button"
          className="w-full cursor-pointer bg-primary hover:bg-primary/90"
          onClick={onApprove}
          disabled={approving}
          data-testid="prescription-approve-footer"
        >
          {approving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Approve Prescription"
          )}
        </Button>
        <button
          type="button"
          onClick={onDiscard}
          className="w-full cursor-pointer py-2 text-sm text-red-500 hover:text-red-700"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

function MedicationFields({
  med,
  index,
  drugNames,
  drugNamesLoading,
  onFocusDrugName,
  onUpdate,
  onRemove,
}) {
  const foodValue = FOOD_OPTIONS.some((opt) => opt.value === med.instructions)
    ? med.instructions
    : "";
  const customInstructions =
    med.instructions && !foodValue ? med.instructions : "";
  const aiSuggested = isAiSuggestedMedication(med);

  return (
    <div
      className="relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      data-testid="prescription-medication-card"
      data-ai-suggested={aiSuggested ? "true" : "false"}
    >
      <button
        type="button"
        aria-label="Remove medicine"
        onClick={() => onRemove(index)}
        className="absolute right-3 top-3 cursor-pointer text-red-500 hover:text-red-700"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="mb-2 flex flex-wrap items-center gap-2 pr-8">
        <span className="text-xs font-medium text-gray-500">Medicine {index + 1}</span>
        {aiSuggested ? (
          <span
            className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
            data-testid="ai-suggested-badge"
            title={
              typeof med.confidence === "number"
                ? `AI confidence ${Math.round(med.confidence * 100)}%`
                : "Suggested by AI — review before approving"
            }
          >
            AI suggested
            {typeof med.confidence === "number"
              ? ` · ${Math.round(med.confidence * 100)}%`
              : ""}
          </span>
        ) : null}
      </div>
      <div className="grid gap-3 pr-8 sm:grid-cols-2">
        <Field label="Drug name" className="sm:col-span-2">
          <Combobox
            value={med.name}
            onValueChange={(name) => onUpdate(index, { ...med, name })}
            options={drugNames}
            placeholder={drugNamesLoading ? "Loading suggestions…" : "Brand name"}
            showAllOnEmpty={false}
            maxSuggestions={75}
            emptyQueryHint="Type to search medicines…"
            emptyMessage="No matches — you can still use this as a custom entry."
            onFocusField={onFocusDrugName}
            inputClassName="text-sm"
          />
        </Field>
        <Field label="Dose" className="sm:col-span-2">
          <PrescriptionFieldChips
            value={med.dosage ?? ""}
            onChange={(dosage) => onUpdate(index, { ...med, dosage })}
            presets={dosePresetsForMedicine(med.name)}
            placeholder="e.g. 500mg"
            testId="prescription-dose-chips"
          />
        </Field>
        <Field label="Frequency" className="sm:col-span-2">
          <PrescriptionFieldChips
            value={med.frequency ?? ""}
            onChange={(frequency) => onUpdate(index, { ...med, frequency })}
            presets={PRESCRIPTION_FREQUENCY_OPTIONS}
            placeholder="e.g. OD / 1-0-1"
            testId="prescription-frequency-chips"
          />
        </Field>
        <Field label="Duration" className="sm:col-span-2">
          <PrescriptionFieldChips
            value={med.duration ?? ""}
            onChange={(duration) => onUpdate(index, { ...med, duration })}
            presets={PRESCRIPTION_DURATION_PRESETS}
            placeholder="e.g. 5 days"
            testId="prescription-duration-chips"
          />
        </Field>
        <Field label="Timing" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {FOOD_OPTIONS.map((opt) => {
              const selected = foodValue === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onUpdate(index, {
                      ...med,
                      instructions: selected ? "" : opt.value,
                    })
                  }
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {customInstructions ? (
            <Input
              className="mt-2 text-sm"
              value={customInstructions}
              onChange={(e) =>
                onUpdate(index, { ...med, instructions: e.target.value })
              }
              placeholder="Other instructions"
            />
          ) : null}
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children, className }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      {children}
    </div>
  );
}
