"use client";

import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function PrescriptionDraftPanel({
  draft,
  patient,
  approving,
  onApprove,
  onDiscard,
  onAddMedication,
  onUpdateMedication,
  onRemoveMedication,
  onUpdateAdvice,
  onUpdateFollowUpDays,
}) {
  const patientLabel = [
    patient?.name ?? "Patient",
    patient?.age != null ? `${patient.age}yr` : null,
    patient?.gender ?? null,
  ].filter(Boolean).join(" · ");

  const adviceText = Array.isArray(draft.advice) ? draft.advice.join("\n") : "";

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

      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Rx</h3>
            <div className="space-y-3">
              {(draft.medications ?? []).map((med, index) => (
                <div
                  key={index}
                  className="relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <button
                    type="button"
                    aria-label="Remove medicine"
                    onClick={() => onRemoveMedication(index)}
                    className="absolute right-3 top-3 cursor-pointer text-red-500 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="grid gap-3 pr-8 sm:grid-cols-2">
                    <Field label="Drug name">
                      <Input
                        value={med.name}
                        onChange={(e) => onUpdateMedication(index, { ...med, name: e.target.value })}
                        placeholder="Brand name"
                        className="text-sm"
                      />
                    </Field>
                    <Field label="Dose">
                      <Input
                        value={med.dosage}
                        onChange={(e) => onUpdateMedication(index, { ...med, dosage: e.target.value })}
                        placeholder="500mg"
                        className="text-sm"
                      />
                    </Field>
                    <Field label="Frequency">
                      <Input
                        value={med.frequency}
                        onChange={(e) => onUpdateMedication(index, { ...med, frequency: e.target.value })}
                        placeholder="1-0-1"
                        className="text-sm"
                      />
                    </Field>
                    <Field label="Duration">
                      <Input
                        value={med.duration}
                        onChange={(e) => onUpdateMedication(index, { ...med, duration: e.target.value })}
                        placeholder="5 days"
                        className="text-sm"
                      />
                    </Field>
                    <Field label="Instructions (optional)" className="sm:col-span-2">
                      <Input
                        value={med.instructions ?? ""}
                        onChange={(e) => onUpdateMedication(index, { ...med, instructions: e.target.value })}
                        placeholder="after food"
                        className="text-sm"
                      />
                    </Field>
                  </div>
                </div>
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

function Field({ label, children, className }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      {children}
    </div>
  );
}
