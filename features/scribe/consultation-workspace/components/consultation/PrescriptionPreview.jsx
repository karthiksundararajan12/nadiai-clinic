"use client";

import { CheckCircle, FileText, X } from "lucide-react";

export function PrescriptionPreview({
  open,
  onViewPrescription,
  onSkip,
  onDismiss,
}) {
  if (!open) return null;

  return (
    <div className="mx-6 mb-3 mt-4 animate-in slide-in-from-top-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <p className="text-sm font-medium text-green-800">
            SOAP approved · Prescription auto-generated
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-all duration-200 hover:bg-gray-50"
            onClick={onViewPrescription}
          >
            <FileText className="h-4 w-4" />
            View Prescription
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-lg px-3 py-2 text-sm text-gray-600 transition-all duration-200 hover:bg-green-100"
            onClick={onSkip ?? onDismiss}
          >
            Skip
          </button>
          <button type="button" className="cursor-pointer rounded p-1 text-gray-500" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ApprovedStatusBadge({ approved }) {
  if (!approved) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
      <CheckCircle className="h-3.5 w-3.5" />
      SOAP Approved
    </span>
  );
}
