"use client";

import { Loader2 } from "lucide-react";

export function PrescriptionGeneratingView() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-8" data-testid="prescription-generating">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-center text-sm text-gray-600">
        Generating prescription based on your style…
      </p>
      <div className="w-full max-w-md space-y-3">
        <div className="h-10 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-16 animate-pulse rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}
