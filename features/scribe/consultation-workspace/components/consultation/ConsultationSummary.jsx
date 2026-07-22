"use client";

import { useState } from "react";
import { Activity, Check, Clock, Edit2, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

function EditableField({ label, value, onSave, readOnly, icon: Icon }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  if (readOnly) {
    return value ? (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
      </div>
    ) : null;
  }

  return (
    <div className="group rounded-lg border border-gray-200 bg-white px-3 py-2.5 transition-all duration-200">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </p>
        {!editing && (
          <button
            type="button"
            className="cursor-pointer rounded p-1 text-gray-400 opacity-0 transition-all duration-200 group-hover:opacity-100 hover:text-primary"
            onClick={() => { setDraft(value ?? ""); setEditing(true); }}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            className="cursor-pointer rounded bg-primary px-2 py-1 text-white transition-all duration-200 hover:bg-primary/90"
            onClick={() => { onSave?.(draft); setEditing(false); }}
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <p className="mt-1 text-sm font-medium text-gray-900">{value || <span className="italic text-gray-400">Not documented</span>}</p>
      )}
    </div>
  );
}

function EditableSymptom({ symptom, onSave, onRemove, readOnly }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(symptom);

  if (readOnly) {
    return (
      <li className="flex items-start gap-2 text-sm text-gray-800">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
        {symptom}
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2 text-sm text-gray-800">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      {editing ? (
        <>
          <input className="flex-1 rounded border border-gray-200 px-2 py-0.5 text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="button" className="cursor-pointer text-primary" onClick={() => { onSave?.(draft); setEditing(false); }}>
            <Check className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1">{symptom}</span>
          <button
            type="button"
            className="cursor-pointer rounded p-0.5 text-gray-400 opacity-0 transition-all duration-200 group-hover:opacity-100 hover:text-primary"
            onClick={() => setEditing(true)}
          >
            <Edit2 className="h-3 w-3" />
          </button>
        </>
      )}
    </li>
  );
}

export function ConsultationSummary({
  summary,
  readOnly,
  onUpdateChiefComplaint,
  onUpdateDuration,
  onUpdateSymptoms,
  onUpdateKeyFindings,
  className,
}) {
  const symptoms = summary?.symptoms ?? [];
  const keyFindings = summary?.keyFindings ?? [];

  return (
    <div className={cn("bg-white border border-gray-200 rounded-lg shadow-none p-4", className)}>
      <div className="mb-3 flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-900">Consultation Summary</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <EditableField
          label="Chief Complaint"
          value={summary?.chiefComplaint}
          onSave={onUpdateChiefComplaint}
          readOnly={readOnly}
        />
        <EditableField
          label="Duration"
          value={summary?.duration}
          onSave={onUpdateDuration}
          readOnly={readOnly}
          icon={Clock}
        />
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          <Activity className="h-3 w-3" />
          Symptoms
        </p>
        {symptoms.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {symptoms.map((symptom, i) => (
              <EditableSymptom
                key={`${symptom}-${i}`}
                symptom={symptom}
                readOnly={readOnly}
                onSave={(next) => {
                  const updated = [...symptoms];
                  updated[i] = next;
                  onUpdateSymptoms?.(updated);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm italic text-gray-400">No symptoms documented</p>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Key Findings</p>
        {keyFindings.length > 0 ? (
          <p className="mt-1 text-sm text-gray-800">{keyFindings.join(" · ")}</p>
        ) : (
          <p className="mt-1 text-sm italic text-gray-400">No key findings documented</p>
        )}
        {!readOnly && (
          <button
            type="button"
            className="mt-2 cursor-pointer text-xs text-primary transition-all duration-200 hover:underline"
            onClick={() => onUpdateKeyFindings?.(keyFindings.length ? keyFindings : [" "])}
          >
            <Edit2 className="mr-1 inline h-3 w-3" />
            Edit findings
          </button>
        )}
      </div>
    </div>
  );
}
