"use client";

import { Loader2 } from "lucide-react";

export function SoapRegeneratingOverlay({ visible }) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white/90 backdrop-blur-[1px]">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="text-center">
        <p className="text-sm font-medium text-gray-900">Generating a new SOAP note…</p>
        <p className="mt-1 text-xs text-gray-500">Previous versions are saved in version history.</p>
      </div>
      <div className="h-1 w-48 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
      </div>
    </div>
  );
}
