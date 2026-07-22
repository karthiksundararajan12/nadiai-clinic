"use client";

export function ScribeShell({ header, children, className }) {
  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-white ${className ?? ""}`}
      data-testid="scribe-shell"
    >
      {header}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

export function ScribeCard({ title, children, className }) {
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${className ?? ""}`}
    >
      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

/** @param {{ recording: React.ReactNode; soap: React.ReactNode }} props */
export function ScribeColumns({ recording, soap }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 lg:flex-row">
      <ScribeCard title="Transcript" className="min-h-[280px] lg:min-h-0 lg:flex-[1.2]">
        {recording}
      </ScribeCard>
      <ScribeCard title="SOAP Note" className="min-h-[280px] lg:min-h-0 lg:flex-1 lg:max-w-none">
        {soap}
      </ScribeCard>
    </div>
  );
}
