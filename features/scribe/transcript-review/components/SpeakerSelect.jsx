"use client";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

const OPTIONS = [
  { speaker: "A", label: "Doctor" },
  { speaker: "B", label: "Patient" },
  { speaker: "C", label: "Attendant" },
  { speaker: "U", label: "Unknown" },
];

export function SpeakerSelect({ speaker, speakerLabel, onChange, disabled }) {
  const current = OPTIONS.find((o) => o.speaker === speaker) ?? OPTIONS.find((o) => o.label === speakerLabel) ?? OPTIONS[3];
  return (
    <Select value={current.speaker} onValueChange={(value) => {
      const next = OPTIONS.find((option) => option.speaker === value);
      onChange?.({ speaker: next.speaker, speaker_label: next.label });
    }}>
      {({ open, setOpen }) => (
        <>
          <SelectTrigger
            open={open}
            onClick={() => !disabled && setOpen(!open)}
            disabled={disabled}
            aria-label="Change speaker label"
            className="h-8 min-w-28"
          >
            {current.label}
          </SelectTrigger>
          <SelectContent open={open}>
            {OPTIONS.map((option) => (
              <SelectItem
                key={option.speaker}
                value={option.speaker}
                selected={option.speaker === current.speaker}
                onSelect={() => {
                  onChange?.({ speaker: option.speaker, speaker_label: option.label });
                  setOpen(false);
                }}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </>
      )}
    </Select>
  );
}
