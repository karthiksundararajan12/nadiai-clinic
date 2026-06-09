"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CORE_SOAP_SECTIONS } from "../../lib/clinical-safety.js";
import { SOAPQualityIndicator } from "./SOAPQualityIndicator.jsx";

function EvidenceList({ items, onJump }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Evidence from transcript
      </p>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onJump?.(item)}
              className="text-left text-xs text-teal-700 hover:underline"
            >
              • {item.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SOAPCardsPanel({
  draft,
  dirty,
  readOnly,
  saving,
  error,
  generating,
  evidenceMap,
  quality,
  activeSection,
  onChange,
  onRetry,
  onSectionFocus,
  onEvidenceJump,
}) {
  const [editingSection, setEditingSection] = useState(null);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" data-testid="soap-review-workspace">
        <p className="text-sm text-rose-600">{error.message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8" data-testid="soap-review-workspace">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        <p className="text-sm text-slate-600">Generating SOAP note…</p>
      </div>
    );
  }

  const disabled = readOnly || saving;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="soap-review-workspace">
      <div className="shrink-0 space-y-3 border-b border-slate-100 p-4">
        <SOAPQualityIndicator quality={quality} />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {CORE_SOAP_SECTIONS.map(([key, label]) => {
          const value = draft[key] ?? "";
          const isEditing = editingSection === key;
          const isEmpty = !String(value).trim();
          const isActive = activeSection === key;

          return (
            <article
              key={key}
              id={`soap-section-${key}`}
              className={cn(
                "rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow",
                isActive && "ring-2 ring-teal-400/40",
                isEmpty && !disabled && "border-amber-200/80",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
                {!disabled && !isEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-teal-700"
                    onClick={() => {
                      setEditingSection(key);
                      onSectionFocus?.(key);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                )}
                {isEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setEditingSection(null)}
                  >
                    Done
                  </Button>
                )}
              </div>

              {isEditing ? (
                <Textarea
                  value={value}
                  onChange={(e) => onChange(key, e.target.value)}
                  onFocus={() => onSectionFocus?.(key)}
                  disabled={saving}
                  rows={4}
                  className="mt-3 min-h-0 resize-y text-sm"
                  placeholder={`Enter ${label.toLowerCase()}…`}
                />
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {value || (
                    <span className="text-slate-400 italic">
                      {key === "objective"
                        ? "No objective findings documented."
                        : `No ${label.toLowerCase()} documented.`}
                    </span>
                  )}
                </p>
              )}

              {dirty[key] && (
                <p className="mt-2 text-[11px] text-indigo-600">Unsaved changes</p>
              )}

              <EvidenceList
                items={evidenceMap?.[key]}
                onJump={(item) => onEvidenceJump?.(item, key)}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function SOAPEmptyState({ generating, error, onRetry }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {error ? (
        <>
          <p className="text-sm text-rose-600">{error.message}</p>
          {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>}
        </>
      ) : generating ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          <p className="text-sm text-slate-600">SOAP note will appear after transcription.</p>
        </>
      ) : (
        <p className="text-sm text-slate-500">SOAP note will generate automatically.</p>
      )}
    </div>
  );
}
