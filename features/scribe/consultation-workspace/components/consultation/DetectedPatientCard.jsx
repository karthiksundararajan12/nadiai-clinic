"use client";

import { formatDetectedLine, sexLabel } from "../../lib/patient-extraction.js";

const FIELD = "min-h-10 w-full rounded-md border bg-white px-2 py-1.5 text-sm text-gray-900";

function shell(low) {
  return low ? `${FIELD} border-amber-400 ring-2 ring-amber-200` : `${FIELD} border-gray-200`;
}

export function DetectedPatientCard({
  detected,
  draft,
  onChange,
  onConfirm,
  onDismiss,
  existingPrompt,
  onUseExisting,
  onCreateNew,
  busy,
  error,
}) {
  if (!detected && !existingPrompt) return null;
  const fields = draft ?? detected ?? {};
  const low = fields.confidence ?? {};

  return (
    <section
      className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      data-testid="detected-patient-card"
    >
      <p className="font-semibold">{formatDetectedLine(fields)}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Name {low.name === "low" ? <em className="text-amber-700">verify</em> : null}</span>
          <input
            aria-label="Detected name"
            className={shell(low.name === "low")}
            value={fields.name ?? ""}
            onChange={(event) => onChange?.({ ...fields, name: event.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Age {low.age === "low" ? <em className="text-amber-700">verify</em> : null}</span>
          <input
            aria-label="Detected age"
            inputMode="numeric"
            className={shell(low.age === "low")}
            value={fields.age ?? ""}
            onChange={(event) => onChange?.({
              ...fields,
              age: event.target.value === "" ? null : Number(event.target.value.replace(/[^\d]/g, "")),
            })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Sex {low.sex === "low" ? <em className="text-amber-700">verify</em> : null}</span>
          <select
            aria-label="Detected sex"
            className={shell(low.sex === "low")}
            value={fields.sex ?? ""}
            onChange={(event) => onChange?.({ ...fields, sex: event.target.value || null })}
          >
            <option value="">Not heard</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Phone {low.phone === "low" ? <em className="text-amber-700">verify</em> : null}</span>
          <input
            aria-label="Detected phone"
            inputMode="numeric"
            className={shell(low.phone === "low")}
            value={fields.phone ?? ""}
            placeholder="Add phone to send Rx on WhatsApp (optional)"
            onChange={(event) => onChange?.({ ...fields, phone: event.target.value.replace(/\D/g, "").slice(0, 10) })}
          />
          {!fields.phone ? (
            <span className="mt-1 block text-xs text-gray-600">Add phone to send Rx on WhatsApp (optional)</span>
          ) : null}
        </label>
      </div>
      {existingPrompt ? (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="existing-patient-prompt">
          <p className="min-w-0 flex-1 font-medium">{existingPrompt}</p>
          <button type="button" className="rounded-md bg-primary px-3 py-1.5 font-semibold text-white" onClick={onUseExisting} disabled={busy}>Yes</button>
          <button type="button" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold" onClick={onCreateNew} disabled={busy}>No, create new</button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" data-testid="confirm-detected-patient" className="rounded-md bg-primary px-3 py-1.5 font-semibold text-white disabled:opacity-60" onClick={onConfirm} disabled={busy}>
            Confirm patient
          </button>
          <button type="button" data-testid="dismiss-detected-patient" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold" onClick={onDismiss} disabled={busy}>
            Dismiss
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-sm font-medium text-red-700">{error}</p> : null}
      <p className="sr-only">{sexLabel(fields.sex)}</p>
    </section>
  );
}
