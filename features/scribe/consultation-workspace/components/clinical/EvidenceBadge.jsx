"use client";

import { Check, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { ICON_SIZE_SM, ICON_STROKE } from "@/lib/icons";
import { isLowConfidence } from "../../lib/soap-statement-evidence.js";

const BADGE_STYLES = {
  full: {
    label: "Evidence Found",
    Icon: Check,
    className: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  },
  partial: {
    label: "Partial Evidence",
    Icon: AlertTriangle,
    className: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
  },
  none: {
    label: "No Evidence",
    Icon: X,
    className: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
  },
};

/**
 * @param {{
 *   evidence: import("../../lib/soap-statement-evidence.js").SoapStatementEvidence;
 *   onClick?: () => void;
 *   className?: string;
 * }} props
 */
export function EvidenceBadge({ evidence, onClick, className }) {
  const style = BADGE_STYLES[evidence.status] ?? BADGE_STYLES.none;
  const low = isLowConfidence(evidence) && evidence.status !== "none";
  const Icon = style.Icon;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
          style.className,
        )}
      >
        <Icon className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} aria-hidden />
        {style.label}
      </button>

      {low && (
        <Tooltip
          content="This statement may contain inferred information. Please verify."
          side="top"
          className="max-w-[220px] whitespace-normal text-center"
        >
          <span className="inline-flex cursor-help items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900">
            <AlertTriangle className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} aria-hidden />
            Low Confidence
          </span>
        </Tooltip>
      )}
    </div>
  );
}
