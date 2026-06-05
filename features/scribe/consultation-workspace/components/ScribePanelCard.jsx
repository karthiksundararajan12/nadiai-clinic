"use client";

import { cn } from "@/lib/utils";

/**
 * Enterprise panel card — elevated white surface on slate canvas.
 */
export function ScribePanelCard({
  title,
  subtitle,
  headerRight,
  footer,
  children,
  className,
  contentClassName,
  "data-testid": testId,
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      <div className="shrink-0 border-b border-slate-100/90 bg-gradient-to-b from-white to-slate-50/30 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{subtitle}</p>
            )}
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </div>
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", contentClassName)}>
        {children}
      </div>

      {footer && (
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/40">{footer}</div>
      )}
    </div>
  );
}
