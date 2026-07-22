"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
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
      <>
        <Header title="Prescription review" subtitle="Review and approve generated prescription" />
        <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
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
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-6">
            <PrescriptionReviewWorkspace
              sessionId={rxReviewSessionId}
              onApproved={() => {
                setRxReviewSessionId(null);
                window.history.replaceState({}, "", "/scribe");
              }}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="AI Scribe" subtitle="Record on the left · SOAP note on the right" />
      <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col overflow-hidden">
        <ScribeWorkflow />
      </div>
    </>
  );
}
