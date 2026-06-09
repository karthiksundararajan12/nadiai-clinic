"use client";

export function ScribeShell({ header, children, className }) {
  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-background ${className ?? ""}`}
      data-testid="scribe-shell"
    >
      {header}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

export function ScribeCard({ title, children, className, icon, headerAction }) {
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all hover:shadow-md ${className ?? ""}`}
    >
      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon && <div className="text-muted-foreground">{icon}</div>}
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          </div>
          {headerAction && <div className="text-xs text-muted-foreground">{headerAction}</div>}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

/** @param {{ recording: React.ReactNode; soap: React.ReactNode }} props */
export function ScribeColumns({ recording, soap }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4 lg:flex-row lg:gap-4">
      <ScribeCard 
        title="Transcript" 
        className="min-h-[280px] lg:min-h-0 lg:flex-[1.2]"
        icon={<span className="text-lg">🎤</span>}
        headerAction="Live"
      >
        {recording}
      </ScribeCard>
      <ScribeCard 
        title="SOAP Note" 
        className="min-h-[280px] lg:min-h-0 lg:flex-1 lg:max-w-none"
        icon={<span className="text-lg">📋</span>}
        headerAction="Review"
      >
        {soap}
      </ScribeCard>
    </div>
  );
}
