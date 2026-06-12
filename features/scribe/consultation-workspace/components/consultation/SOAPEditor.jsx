"use client";

import { Loader2 } from "lucide-react";
import { CORE_SOAP_SECTIONS } from "../../lib/clinical-safety.js";
import { SOAPSection } from "./SOAPSection.jsx";
import { SOAPQualityIndicator } from "../clinical/SOAPQualityIndicator.jsx";

/**
 * @param {object} props
 * @param {Record<string, string>} props.draft
 * @param {import("../../lib/soap-statement-evidence.js").SoapStatementEvidence[]} [props.statementEvidence]
 * @param {string|null} [props.activeStatementId]
 */
export function SOAPEditor({
  draft,
  dirty,
  readOnly,
  saving,
  error,
  generating,
  regenerating,
  quality,
  statementEvidence = [],
  activeStatementId,
  activeSection,
  onChange,
  onRetry,
  onSectionFocus,
  onRegenerate,
  onStatementClick,
  onEvidenceBadgeClick,
}) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center" data-testid="soap-review-workspace">
        <p className="text-sm text-red-600">{error.message}</p>
        <button type="button" className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm" onClick={onRetry}>Retry</button>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8" data-testid="soap-review-workspace">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
        <p className="text-sm text-gray-600">Generating SOAP note…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="soap-review-workspace">
      {quality && !readOnly && !generating && !regenerating && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-none">
          <SOAPQualityIndicator quality={quality} />
        </div>
      )}
      {CORE_SOAP_SECTIONS.map(([key, label]) => (
        <SOAPSection
          key={key}
          sectionKey={key}
          label={label}
          value={draft[key] ?? ""}
          showConfidence={false}
          readOnly={readOnly}
          saving={saving}
          regenerating={regenerating}
          isActive={activeSection === key}
          statementEvidence={statementEvidence}
          activeStatementId={activeStatementId}
          onChange={onChange}
          onFocus={onSectionFocus}
          onRegenerateSection={onRegenerate}
          onStatementClick={onStatementClick}
          onEvidenceBadgeClick={onEvidenceBadgeClick}
          showVitals={key === "objective"}
          showStatementEvidence
        />
      ))}
      {dirty && Object.keys(dirty).length > 0 && (
        <p className="text-center text-[11px] text-cyan-600">Unsaved changes</p>
      )}
    </div>
  );
}

export function SOAPEditorEmpty({ generating, error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white p-8 text-center shadow-none">
      {error ? (
        <>
          <p className="text-sm text-red-600">{error.message}</p>
          {onRetry && (
            <button type="button" className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm" onClick={onRetry}>Retry</button>
          )}
        </>
      ) : generating ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
          <p className="text-sm text-gray-600">SOAP note will appear after transcription.</p>
        </>
      ) : (
        <p className="text-sm text-gray-500">Start a recording to generate a SOAP note.</p>
      )}
    </div>
  );
}
