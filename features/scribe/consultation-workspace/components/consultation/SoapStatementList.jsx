"use client";

import { cn } from "@/lib/utils";
import { EvidenceBadge } from "../clinical/EvidenceBadge.jsx";
import { splitSectionIntoStatements } from "../../lib/soap-statement-evidence.js";

/**
 * @param {{
 *   sectionKey: string;
 *   sectionText: string;
 *   evidenceMappings: import("../../lib/soap-statement-evidence.js").SoapStatementEvidence[];
 *   activeStatementId?: string | null;
 *   onStatementClick?: (evidence: import("../../lib/soap-statement-evidence.js").SoapStatementEvidence) => void;
 *   onBadgeClick?: (evidence: import("../../lib/soap-statement-evidence.js").SoapStatementEvidence) => void;
 * }} props
 */
export function SoapStatementList({
  sectionKey,
  sectionText,
  evidenceMappings,
  activeStatementId,
  onStatementClick,
  onBadgeClick,
}) {
  const statements = splitSectionIntoStatements(sectionKey, sectionText);
  if (!statements.length) return null;

  const evidenceById = new Map(
    evidenceMappings
      .filter((m) => m.sectionKey === sectionKey)
      .map((m) => [m.soapStatementId, m]),
  );

  return (
    <ul className="space-y-2">
      {statements.map((statement) => {
        const evidence = evidenceById.get(statement.id) ?? {
          soapStatementId: statement.id,
          sectionKey,
          statementText: statement.text,
          transcriptSegmentId: null,
          evidenceText: null,
          confidence: 0,
          status: "none",
          speaker: null,
        };
        const isActive = activeStatementId === statement.id;

        return (
          <li key={statement.id}>
            <button
              type="button"
              onClick={() => onStatementClick?.(evidence)}
              className={cn(
                "flex w-full cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg border bg-white px-3 py-2 text-left transition-all duration-300",
                isActive
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30 animate-evidence-pulse"
                  : "border-gray-100 hover:border-gray-200 hover:bg-gray-50",
              )}
            >
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-gray-800">{statement.text}</p>
              <EvidenceBadge
                evidence={evidence}
                onClick={() => onBadgeClick?.(evidence)}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
