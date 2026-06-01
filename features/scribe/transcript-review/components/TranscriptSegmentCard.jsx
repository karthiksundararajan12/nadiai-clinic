"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SpeakerSelect } from "./SpeakerSelect.jsx";
import { Timestamp } from "./Timestamp.jsx";

export function TranscriptSegmentCard({ segment, dirty, disabled, onChange }) {
  return (
    <Card
      className={cn(
        "transition-colors",
        segment.is_low_confidence && "border-amber-400/50 bg-amber-500/5",
        dirty && "border-primary/50 bg-primary/5",
      )}
    >
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SpeakerSelect
            speaker={segment.speaker}
            speakerLabel={segment.speaker_label}
            disabled={disabled}
            onChange={(patch) => onChange(segment.id, patch)}
          />
          <Timestamp seconds={segment.start_seconds} />
          <span className="text-xs text-muted-foreground">to</span>
          <Timestamp seconds={segment.end_seconds} />
          {segment.is_low_confidence && (
            <Badge variant="warning" className="gap-1" aria-label="Low confidence segment">
              <AlertTriangle className="size-3" />
              Low confidence {segment.confidence ? `${Math.round(segment.confidence * 100)}%` : ""}
            </Badge>
          )}
          {dirty && <Badge variant="accent">Unsaved</Badge>}
        </div>

        <label className="sr-only" htmlFor={`segment-${segment.id}`}>
          Edit transcript segment from {segment.start_seconds} seconds
        </label>
        <Textarea
          id={`segment-${segment.id}`}
          value={segment.text ?? ""}
          disabled={disabled}
          onChange={(event) => onChange(segment.id, { text: event.target.value })}
          className="min-h-24 resize-y leading-relaxed"
        />
      </CardContent>
    </Card>
  );
}
