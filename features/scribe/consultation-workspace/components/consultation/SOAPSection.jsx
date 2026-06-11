"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { VitalsInput } from "./VitalsInput.jsx";
import {
  buildObjectiveWithVitals,
  parseVitalsFromObjective,
  stripVitalsFromObjective,
} from "../../lib/vitals-objective.js";

const SECTION_STYLES = {
  subjective: { border: "border-l-blue-500", text: "text-blue-600", ring: "focus:ring-blue-500/30" },
  objective: { border: "border-l-teal-600", text: "text-teal-600", ring: "focus:ring-teal-600/30" },
  assessment: { border: "border-l-red-500", text: "text-red-500", ring: "focus:ring-red-500/30" },
  plan: { border: "border-l-green-600", text: "text-green-600", ring: "focus:ring-green-600/30" },
};

const COLLAPSE_LEN = 150;

export function SOAPSection({
  sectionKey,
  label,
  value = "",
  confidence = 85,
  showConfidence = true,
  readOnly,
  saving,
  regenerating,
  isActive,
  evidence,
  onChange,
  onFocus,
  onRegenerateSection,
  onEvidenceJump,
  showVitals,
}) {
  const style = SECTION_STYLES[sectionKey] ?? SECTION_STYLES.subjective;
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);

  const isLong = String(value).length > COLLAPSE_LEN;
  const showCollapsed = readOnly && isLong && !expanded;
  const displayValue = showCollapsed ? `${String(value).slice(0, COLLAPSE_LEN)}…` : value;

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (!readOnly) autoResize();
  }, [readOnly, value, autoResize]);

  useEffect(() => {
    if (isActive && !readOnly && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isActive, readOnly]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <article
      id={`soap-section-${sectionKey}`}
      className={cn(
        "bg-white border border-gray-200 rounded-lg shadow-none border-l-4 transition-all duration-200",
        style.border,
        isActive && "ring-2 ring-cyan-600/20",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-bold uppercase tracking-wide", style.text)}>{label}</span>
          {showConfidence && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
              {confidence}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="cursor-pointer rounded p-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-800"
            onClick={handleCopy}
            aria-label="Copy section"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          {copied && <span className="text-[10px] text-gray-500">Copied</span>}
          {!readOnly && onRegenerateSection && (
            <button
              type="button"
              className="cursor-pointer rounded p-1.5 text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-cyan-600"
              onClick={() => onRegenerateSection(sectionKey)}
              disabled={regenerating}
              aria-label="Regenerate section"
            >
              {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        {showVitals && !readOnly && (
          <>
            <VitalsInput
              value={value}
              onChange={(v) => onChange?.(sectionKey, v)}
              disabled={false}
            />
            <textarea
              value={stripVitalsFromObjective(value)}
              onChange={(e) => {
                const vitals = parseVitalsFromObjective(value);
                onChange?.(sectionKey, buildObjectiveWithVitals(vitals, e.target.value));
              }}
              onFocus={() => onFocus?.(sectionKey)}
              rows={3}
              placeholder="Additional objective findings (e.g. BP discussion, exam notes)…"
              className={cn(
                "w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed transition-all duration-200 focus:outline-none focus:ring-2",
                style.ring,
              )}
            />
          </>
        )}

        {!readOnly && !showVitals ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => { onChange?.(sectionKey, e.target.value); autoResize(); }}
            onFocus={() => onFocus?.(sectionKey)}
            disabled={saving}
            rows={3}
            placeholder={`Enter ${label.toLowerCase()}…`}
            className={cn(
              "w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed transition-all duration-200 focus:outline-none focus:ring-2",
              style.ring,
              saving && "opacity-80",
            )}
          />
        ) : !showVitals ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
            {displayValue || (
              <span className="italic text-gray-400">
                {sectionKey === "objective" ? "No objective findings documented." : `No ${label.toLowerCase()} documented.`}
              </span>
            )}
          </p>
        ) : stripVitalsFromObjective(value) ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
            {stripVitalsFromObjective(value)}
          </p>
        ) : null}

        {readOnly && isLong && (
          <button
            type="button"
            className="mt-2 flex cursor-pointer items-center gap-1 text-xs font-medium text-cyan-600 transition-all duration-200 hover:text-cyan-700"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {evidence?.length > 0 && (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Evidence from transcript</p>
          <ul className="mt-1 space-y-0.5">
            {evidence.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="cursor-pointer text-left text-xs text-cyan-600 transition-all duration-200 hover:underline"
                  onClick={() => onEvidenceJump?.(item)}
                >
                  • {item.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
