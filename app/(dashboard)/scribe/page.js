"use client";

import { useEffect, useState } from "react";
import { ScribeWorkflow } from "@/components/scribe/scribe-workflow";
import { PrescriptionReviewWorkspace } from "@/components/scribe/prescription-review-workspace";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function ScribePage() {
  const [rxReviewSessionId, setRxReviewSessionId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rx = params.get("rx");
    if (rx) setRxReviewSessionId(rx);
  }, []);

  if (rxReviewSessionId) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-slate-50">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setRxReviewSessionId(null);
              window.history.replaceState({}, "", "/scribe");
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to scribe
          </Button>
          <span className="text-[14px] font-semibold text-slate-900">Prescription review</span>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <PrescriptionReviewWorkspace
            sessionId={rxReviewSessionId}
            onApproved={() => {
              setRxReviewSessionId(null);
              window.history.replaceState({}, "", "/scribe");
            }}
          />
        </div>
      </div>
    );
  }

  return <ScribeWorkflow />;
}
