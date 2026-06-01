"use client";

import { GitCompare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECTION_LABELS = {
  chiefComplaint: "Chief Complaint",
  historyOfPresentIllness: "History Of Present Illness",
  subjective: "Subjective",
  objective: "Objective",
  assessment: "Assessment",
  plan: "Plan",
  clinicalSummary: "Clinical Summary",
};

export function SOAPComparePanel({ comparison }) {
  if (!comparison) return null;

  const changed = comparison.diff?.changedSections ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompare className="size-4" />
          Revision comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {changed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No section differences between selected versions.</p>
        ) : changed.map((key) => (
          <div key={key} className="rounded-lg border p-3">
            <h4 className="text-sm font-medium">{SECTION_LABELS[key] ?? key}</h4>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                <p className="mb-1 text-xs font-medium text-muted-foreground">From</p>
                {comparison.from?.note?.[key] || "Empty"}
              </div>
              <div className="rounded-md bg-primary/5 p-3 text-sm whitespace-pre-wrap">
                <p className="mb-1 text-xs font-medium text-muted-foreground">To</p>
                {comparison.to?.note?.[key] || "Empty"}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
