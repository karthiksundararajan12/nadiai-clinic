"use client";

export function ScribePanelHeader({ title, subtitle, onOpenSessions, actions }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <button
          type="button"
          className="cursor-pointer rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50"
          onClick={onOpenSessions}
        >
          Sessions
        </button>
      </div>
    </div>
  );
}
