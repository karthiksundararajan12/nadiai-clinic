"use client";

import { useEffect, useState } from "react";
import { Loader2, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AuditTrailDrawer({ open, onClose, sessionId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !sessionId) return;
    setLoading(true);
    fetch(`/api/scribe/sessions/${sessionId}?include=audit`)
      .then((r) => r.json())
      .then((data) => setEntries(data?.auditTrail ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [open, sessionId]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-slate-900/30" onClick={onClose} aria-label="Close audit" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-teal-600" />
            <h2 className="text-base font-semibold">Audit Trail</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No audit events recorded.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-xl border px-3 py-2 text-sm">
                  <span className="font-medium text-slate-900">{entry.action}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
