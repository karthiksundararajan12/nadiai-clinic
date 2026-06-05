"use client";

/**
 * Full-viewport scribe shell — 20 / 40 / 40 three-column clinical workspace.
 */

export function ScribeShell({ header, actionBar, footer, children, className }) {
  return (
    <div
      className={`flex h-[100dvh] flex-col overflow-hidden bg-slate-50 ${className ?? ""}`}
      data-testid="scribe-shell"
    >
      {header}
      {actionBar}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
      {footer}
    </div>
  );
}

function PanelCard({ children }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
      {children}
    </div>
  );
}

/** @param {{ patient: React.ReactNode; transcript: React.ReactNode; note: React.ReactNode }} props */
export function ScribeColumns({ patient, transcript, note }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="hidden w-[280px] shrink-0 overflow-hidden border-r border-slate-200/80 bg-white lg:flex lg:flex-col">
        {patient}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r border-slate-200/80 bg-slate-50/60 p-3">
        <PanelCard>{transcript}</PanelCard>
      </div>
      <div className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden bg-slate-50/80 p-3 lg:w-[min(440px,40%)]">
        <PanelCard>{note}</PanelCard>
      </div>
    </div>
  );
}
