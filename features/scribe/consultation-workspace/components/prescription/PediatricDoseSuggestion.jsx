"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { calculatePediatricDose } from "@/features/scribe/lib/pediatric-dosage/calculator.js";
import { findPediatricDosageReference } from "@/features/scribe/lib/pediatric-dosage/reference-data.js";

/**
 * Weight-based pediatric dose suggestion for a medicine row.
 *
 * Suggestion is pre-filled and editable, but is NOT written into the
 * prescription dosage until the doctor explicitly accepts it.
 *
 * @param {object} props
 * @param {string} props.drugName
 * @param {number|null|undefined} props.weightKg
 * @param {number} props.medicationIndex
 * @param {string|null|undefined} props.sessionId
 * @param {(dosage: string) => void} props.onAcceptDose
 * @param {(payload: Record<string, unknown>) => Promise<void>|void} [props.onLogDoseEvent]
 */
export function PediatricDoseSuggestion({
  drugName,
  weightKg,
  medicationIndex,
  sessionId,
  onAcceptDose,
  onLogDoseEvent,
}) {
  const inputId = useId();
  const loggedKeyRef = useRef("");
  const [dismissed, setDismissed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [editableDose, setEditableDose] = useState("");

  const reference = findPediatricDosageReference(drugName);
  const result = calculatePediatricDose({ drugName, weightKg, reference });

  // Reset local accept/dismiss state when drug or weight changes.
  useEffect(() => {
    setDismissed(false);
    setAccepted(false);
    if (result.ok) {
      setEditableDose(result.displayDose);
    } else {
      setEditableDose("");
    }
  }, [drugName, weightKg, result.ok, result.displayDose]);

  // Audit: log suggestion / exceeds_max once per drug+weight combo.
  useEffect(() => {
    if (!onLogDoseEvent || !sessionId || !reference || weightKg == null) return;
    if (!result.ok && result.reason !== "exceeds_max") return;

    const key = `${drugName}|${weightKg}|${result.ok ? "suggested" : "exceeds_max"}`;
    if (loggedKeyRef.current === key) return;
    loggedKeyRef.current = key;

    void onLogDoseEvent({
      action: result.ok ? "suggested" : "exceeds_max",
      drug_name: drugName,
      reference_drug_name: reference.drugName,
      weight_kg: Number(weightKg),
      medication_index: medicationIndex,
      suggested_dose_mg: result.calculatedMg ?? null,
      suggested_dose_ml: result.ok ? result.doseMl : null,
      suggested_dose_display: result.displayDose ?? null,
    });
  }, [
    drugName,
    weightKg,
    medicationIndex,
    sessionId,
    reference,
    result,
    onLogDoseEvent,
  ]);

  if (!reference || weightKg == null || weightKg <= 0) return null;
  if (dismissed || accepted) return null;
  if (!result.ok && result.reason === "no_reference") return null;

  if (!result.ok && result.reason === "exceeds_max") {
    return (
      <div
        className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800"
        data-testid="pediatric-dose-max-warning"
        role="alert"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{result.warning}</p>
        </div>
      </div>
    );
  }

  if (!result.ok) return null;

  const handleAccept = () => {
    const dose = editableDose.trim();
    if (!dose) return;
    onAcceptDose(dose);
    setAccepted(true);
    void onLogDoseEvent?.({
      action: "accepted",
      drug_name: drugName,
      reference_drug_name: reference.drugName,
      weight_kg: Number(weightKg),
      medication_index: medicationIndex,
      suggested_dose_mg: result.calculatedMg,
      suggested_dose_ml: result.doseMl,
      suggested_dose_display: result.displayDose,
      confirmed_dose_display: dose,
    });
  };

  const handleDismiss = () => {
    setDismissed(true);
    void onLogDoseEvent?.({
      action: "dismissed",
      drug_name: drugName,
      reference_drug_name: reference.drugName,
      weight_kg: Number(weightKg),
      medication_index: medicationIndex,
      suggested_dose_mg: result.calculatedMg,
      suggested_dose_ml: result.doseMl,
      suggested_dose_display: result.displayDose,
    });
  };

  return (
    <div
      className="mt-2 rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2.5"
      data-testid="pediatric-dose-suggestion"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full border border-primary/25 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
          data-testid="pediatric-dose-badge"
        >
          AI-suggested — confirm dose
        </span>
        <span className="text-[11px] text-gray-500">
          Based on {weightKg} kg · {reference.drugName}{" "}
          {reference.mgPerKgMin}–{reference.mgPerKgMax}{" "}
          {reference.formulation === "ors" ? "ml/kg" : "mg/kg"}
        </span>
      </div>

      <label htmlFor={inputId} className="mb-1 block text-[11px] text-gray-500">
        Suggested dose (editable)
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id={inputId}
          value={editableDose}
          onChange={(e) => setEditableDose(e.target.value)}
          className="text-sm sm:flex-1"
          data-testid="pediatric-dose-input"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="cursor-pointer bg-primary hover:bg-primary/90"
            onClick={handleAccept}
            data-testid="pediatric-dose-accept"
          >
            Use dose
          </Button>
          <button
            type="button"
            onClick={handleDismiss}
            className={cn(
              "cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600",
              "hover:bg-gray-100",
            )}
            data-testid="pediatric-dose-dismiss"
          >
            Dismiss
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">
        Not added to the prescription until you tap Use dose.
      </p>
    </div>
  );
}
