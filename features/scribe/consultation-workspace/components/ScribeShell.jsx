"use client";

/**
 * Full-viewport scribe shell — patient sidebar + two elevated panel cards.
 */

export function ScribeShell({ header, actionBar, footer, children, className }) {
  return (
    <div
      className={`flex h-[100dvh] flex-col overflow-hidden bg-[#f4f6f9] ${className ?? ""}`}
      data-testid="scribe-shell"
    >
      {header}
      {actionBar}
      <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
      {footer}
    </div>
  );
}

/** @param {{ patient: React.ReactNode; transcript: React.ReactNode; note: React.ReactNode }} props */
export function ScribeColumns({ patient, transcript, note }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 lg:flex-row lg:gap-5 lg:p-5">
      <div className="hidden h-full min-h-0 w-[272px] shrink-0 lg:block">{patient}</div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{transcript}</div>

      <div className="flex h-[min(48vh,520px)] min-h-0 shrink-0 flex-col lg:h-full lg:w-[min(420px,42%)]">
        {note}
      </div>
    </div>
  );
}
