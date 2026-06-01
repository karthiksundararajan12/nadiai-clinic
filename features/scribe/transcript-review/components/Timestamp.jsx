"use client";

export function Timestamp({ seconds }) {
  return (
    <time className="font-mono text-xs text-muted-foreground tabular-nums">
      {formatTimestamp(seconds)}
    </time>
  );
}

export function formatTimestamp(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds)));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
