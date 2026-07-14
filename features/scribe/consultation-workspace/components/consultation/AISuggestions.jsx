"use client";

import { useState } from "react";
import { Activity, Copy, Edit2, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

function Card({ title, icon: Icon, children, className }) {
  return (
    <div className={cn("bg-white border border-gray-200 rounded-lg shadow-none p-4", className)}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function ICD10Card({ icd, overrideCode, onOverride }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(overrideCode ?? "");
  const [copied, setCopied] = useState(false);

  if (!icd?.primary) {
    return (
      <Card title="ICD-10 Suggestion" icon={Tag}>
        <p className="text-sm italic text-gray-400">ICD code will appear after SOAP assessment is generated.</p>
      </Card>
    );
  }

  const display = overrideCode
    ? overrideCode
    : `${icd.primary.code} — ${icd.primary.description}`;

  const handleCopy = async () => {
    const code = overrideCode?.split("—")[0]?.trim() ?? icd.primary.code;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card title="ICD-10 Suggestion" icon={Tag}>
      <p className="text-sm font-medium text-gray-900">{display}</p>
      {icd.secondary?.length > 0 && (
        <ul className="mt-2 space-y-1">
          {icd.secondary.map((s, i) => (
            <li key={i} className="text-xs text-gray-600">
              {s.code ?? s} — {s.description ?? ""}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs transition-all duration-200 hover:bg-gray-50"
          onClick={handleCopy}
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy code"}
        </button>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs transition-all duration-200 hover:bg-gray-50"
          onClick={() => setEditing((v) => !v)}
        >
          <Edit2 className="h-3.5 w-3.5" />
          Override
        </button>
      </div>
      {editing && (
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm"
            placeholder="e.g. J06.9 — Acute URI"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            className="cursor-pointer rounded bg-primary px-3 py-1 text-xs text-white"
            onClick={() => { onOverride?.(draft); setEditing(false); }}
          >
            Save
          </button>
        </div>
      )}
    </Card>
  );
}

export function RPMCard({ rpm, enabled, onToggle, readOnly }) {
  const recommended = rpm?.recommended;

  return (
    <Card title="Remote Monitoring" icon={Activity}>
      {recommended ? (
        <>
          <span className="inline-flex rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[10px] font-semibold text-green-700">
            RPM Recommended
          </span>
          <p className="mt-2 text-sm text-gray-700">{rpm.reason}</p>
        </>
      ) : (
        <p className="text-sm text-gray-500">No AI recommendation. <button type="button" className="cursor-pointer text-primary hover:underline" onClick={() => !readOnly && onToggle?.(true)}>Enable manually</button></p>
      )}

      <label className="mt-4 flex cursor-pointer items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-800">Enable Remote Monitoring</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={readOnly}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-all duration-200",
            enabled ? "bg-primary" : "bg-gray-200",
            readOnly && "cursor-not-allowed opacity-60",
          )}
          onClick={() => !readOnly && onToggle?.(!enabled)}
        >
          <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-all duration-200", enabled && "translate-x-5")} />
        </button>
      </label>
      {enabled && (
        <p className="mt-2 text-xs text-gray-600">First check-in in 24 hours</p>
      )}
    </Card>
  );
}

export function AISuggestions({ icd, rpm, rpmEnabled, icdOverride, onIcdOverride, onRpmToggle, readOnly }) {
  return (
    <div className="space-y-3">
      <ICD10Card icd={icd} overrideCode={icdOverride} onOverride={onIcdOverride} />
      <RPMCard rpm={rpm} enabled={rpmEnabled} onToggle={onRpmToggle} readOnly={readOnly} />
    </div>
  );
}
