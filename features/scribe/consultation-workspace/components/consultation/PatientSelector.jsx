"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createPatient, searchPatients } from "../../services/patient.client.js";

function initials(name) {
  return (name ?? "P").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return days;
}

export function PatientSelector({ patient, onSelect, onClear, className }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", age: "", gender: "Male" });

  const runSearch = useCallback(async (q) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      setResults(await searchPatients(q));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.phone.trim()) return;
    setCreating(true);
    try {
      const created = await createPatient(form);
      onSelect?.(created);
      setShowCreate(false);
      setQuery("");
    } finally {
      setCreating(false);
    }
  };

  if (patient) {
    const days = daysSince(patient.last_visit);
    return (
      <div className={cn("flex w-full flex-col gap-3 border-b border-gray-200 bg-white px-6 py-3", className)}>
        <PatientStepLabel />
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials(patient.name)}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{patient.name}</p>
              <p className="text-xs text-gray-600">
                {[patient.age ? `${patient.age} yrs` : null, patient.gender, patient.phone].filter(Boolean).join(" · ")}
              </p>
            </div>
            {days != null && (
              <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600">
                Last seen {days === 0 ? "today" : `${days} days ago`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="cursor-pointer rounded-lg border border-gray-200 p-2 transition-all duration-200 hover:bg-gray-50" onClick={onClear} aria-label="Clear patient">
              <X className="h-4 w-4 text-gray-500" />
            </button>
            <button type="button" className="cursor-pointer flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs transition-all duration-200 hover:bg-white" onClick={() => setShowCreate(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              New patient
            </button>
          </div>
        </div>
        {showCreate && <CreatePanel form={form} setForm={setForm} creating={creating} onCreate={handleCreate} onClose={() => setShowCreate(false)} />}
      </div>
    );
  }

  return (
    <div className={cn("relative w-full border-b border-gray-200 bg-white px-6 py-4", className)}>
      <PatientStepLabel />
      <div className="relative mt-3 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patient by name or phone..."
          className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
      </div>

      {results.length > 0 && (
        <ul className="absolute left-6 right-6 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-all duration-200 hover:bg-gray-50"
                onClick={() => { onSelect?.(p); setQuery(""); setResults([]); }}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold">{initials(p.name)}</div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-500">{[p.age ? `${p.age} yrs` : null, p.last_visit ? new Date(p.last_visit).toLocaleDateString() : null].filter(Boolean).join(" · ")}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="xs"
        className="mt-2 gap-1"
        onClick={() => setShowCreate(true)}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Create new patient
      </Button>
      {showCreate && <CreatePanel form={form} setForm={setForm} creating={creating} onCreate={handleCreate} onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function PatientStepLabel() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
        1
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">Patient</span>
    </div>
  );
}

function CreatePanel({ form, setForm, creating, onCreate, onClose }) {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Full Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Phone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Age *" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
        <select className="rounded border border-gray-200 px-3 py-2 text-sm" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
          <option>Male</option>
          <option>Female</option>
          <option>Other</option>
        </select>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50" disabled={creating} onClick={onCreate}>
          {creating ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null}
          Create and Attach
        </button>
        <button type="button" className="cursor-pointer rounded-lg border border-gray-200 px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
