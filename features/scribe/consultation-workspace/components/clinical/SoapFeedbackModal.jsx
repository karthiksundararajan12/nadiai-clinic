"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SOAP_FEEDBACK_REASONS, SOAP_FEEDBACK_REASON_LABELS } from "@/features/scribe/constants.js";

export function SoapFeedbackModal({
  open,
  onOpenChange,
  onSubmit,
  submitting,
}) {
  const [selected, setSelected] = useState([]);
  const [otherReason, setOtherReason] = useState("");

  const toggle = (reason) => {
    setSelected((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason],
    );
  };

  const handleSubmit = async () => {
    await onSubmit?.({
      feedback_reasons: selected,
      other_reason: selected.includes("other") ? otherReason.trim() || undefined : undefined,
    });
    setSelected([]);
    setOtherReason("");
  };

  const handleSkip = () => {
    onSubmit?.({ feedback_reasons: [] });
    setSelected([]);
    setOtherReason("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onClose={() => onOpenChange?.(false)}>
        <DialogHeader>
          <DialogTitle>What was wrong with this SOAP note?</DialogTitle>
          <DialogDescription>
            Optional feedback helps improve AI documentation quality. Select all that apply.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 space-y-2 overflow-y-auto py-2">
          {SOAP_FEEDBACK_REASONS.map((reason) => (
            <label
              key={reason}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={selected.includes(reason)}
                onChange={() => toggle(reason)}
              />
              <span>{SOAP_FEEDBACK_REASON_LABELS[reason]}</span>
            </label>
          ))}
        </div>
        {selected.includes("other") && (
          <textarea
            value={otherReason}
            onChange={(e) => setOtherReason(e.target.value)}
            rows={2}
            placeholder="Describe the issue…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="cursor-pointer"
            onClick={handleSkip}
            disabled={submitting}
          >
            Skip
          </Button>
          <Button
            type="button"
            className="cursor-pointer bg-cyan-600 hover:bg-cyan-700"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
