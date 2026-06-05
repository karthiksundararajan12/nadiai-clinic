"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SpeakerSelect } from "../../transcript-review/components/SpeakerSelect.jsx";
import { EmptyTranscriptState } from "../../transcript-review/components/ReviewStateViews.jsx";

export function TranscriptPanel({ segments, dirty, readOnly, saving, sessionStatus, onChange }) {
  const disabled = readOnly || saving || sessionStatus === "REVIEW_COMPLETED";

  return (
    <div
      className="flex min-h-0 flex-col border-r bg-background"
      data-testid="transcript-review-workspace"
    >
      <div className="shrink-0 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Conversation</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {readOnly ? "Read-only transcript" : "Edit speaker labels and text as needed"}
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-[420px] lg:min-h-[calc(100vh-260px)]">
        {segments.length === 0 ? (
          <div className="p-4">
            <EmptyTranscriptState />
          </div>
        ) : (
          <div className="space-y-1 p-3">
            {segments.map((segment) => (
              <TranscriptLine
                key={segment.id}
                segment={segment}
                dirty={Boolean(dirty[segment.id])}
                disabled={disabled}
                onChange={onChange}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function TranscriptLine({ segment, dirty, disabled, onChange }) {
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5 transition-colors",
        segment.is_low_confidence && "bg-amber-500/5",
        dirty && "bg-primary/5 ring-1 ring-primary/20",
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <SpeakerSelect
          speaker={segment.speaker}
          speakerLabel={segment.speaker_label}
          disabled={disabled}
          onChange={(patch) => onChange(segment.id, patch)}
        />
        {segment.is_low_confidence && (
          <Badge variant="warning" className="h-5 gap-1 text-[10px]">
            <AlertTriangle className="size-2.5" />
            Low confidence
          </Badge>
        )}
        {dirty && (
          <Badge variant="accent" className="h-5 text-[10px]">
            Edited
          </Badge>
        )}
      </div>
      <Textarea
        value={segment.text ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(segment.id, { text: event.target.value })}
        rows={Math.min(6, Math.max(2, Math.ceil((segment.text?.length ?? 0) / 80)))}
        className="min-h-0 resize-none border-0 bg-transparent px-0 py-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
        aria-label={`${segment.speaker_label} segment`}
      />
    </div>
  );
}
