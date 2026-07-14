"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function CollapsibleTranscriptPanel({
  segments = [],
  readOnly,
  saving,
  regenerating,
  onChangeText,
  onRegenerateFromTranscript,
}) {
  const [open, setOpen] = useState(false);

  const fullText = useMemo(
    () => segments.map((s) => {
      const speaker = s.speaker_label ?? s.speaker ?? "Speaker";
      return `${speaker}: ${s.text ?? ""}`;
    }).join("\n\n"),
    [segments],
  );

  const [editedText, setEditedText] = useState(fullText);
  const wordCount = (editedText || fullText).split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    setEditedText(fullText);
  }, [fullText]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-none">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 transition-all duration-200 hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">Raw Transcript</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
            {wordCount} words
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
      </button>

      {open && (
        <div className="border-t border-gray-200 px-4 py-3">
          <textarea
            className={cn(
              "min-h-[160px] w-full resize-y rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm leading-relaxed transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30",
              readOnly && "cursor-default opacity-80",
            )}
            value={editedText}
            onChange={(e) => {
              setEditedText(e.target.value);
              onChangeText?.(e.target.value);
            }}
            readOnly={readOnly || saving}
          />
          {!readOnly && onRegenerateFromTranscript && (
            <button
              type="button"
              className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onRegenerateFromTranscript}
              disabled={regenerating || saving}
            >
              {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Re-generate SOAP from edited transcript
            </button>
          )}
        </div>
      )}
    </div>
  );
}
