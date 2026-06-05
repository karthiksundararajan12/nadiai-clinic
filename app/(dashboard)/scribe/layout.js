"use client";

/**
 * Scribe uses a full-viewport clinical workspace — no dashboard chrome.
 */
export default function ScribeLayout({ children }) {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-50">
      {children}
    </div>
  );
}
