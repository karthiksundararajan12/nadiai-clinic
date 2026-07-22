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
    <ul className="mt-3 space-y-3 border-t border-gray-100 pt-3">
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
                "w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-all duration-300",
                isActive
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30 animate-evidence-pulse"
                  : "border-transparent bg-white hover:border-gray-200 hover:bg-gray-50",
              )}
            >
              <p className="text-sm leading-relaxed text-gray-800">{statement.text}</p>
              <EvidenceBadge
                evidence={evidence}
                onClick={() => onBadgeClick?.(evidence)}
                className="mt-2"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
