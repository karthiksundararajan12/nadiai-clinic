"use client";

import { Button } from "@/components/ui/button";

export function PrescriptionErrorView({ onRetry, onEnterManually }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 p-8 text-center" data-testid="prescription-error">
      <p className="text-sm text-red-600">Could not generate. Try again.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" className="cursor-pointer bg-primary hover:bg-primary/90" onClick={onRetry}>
          Retry
        </Button>
        <Button type="button" variant="outline" className="cursor-pointer" onClick={onEnterManually}>
          Enter Manually
        </Button>
      </div>
    </div>
  );
}
