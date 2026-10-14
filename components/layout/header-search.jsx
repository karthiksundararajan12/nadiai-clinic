"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchInput } from "@/components/shared/search-input";
import { cn } from "@/lib/utils";
import { fetchHeaderSearchResults, HEADER_SEARCH_MIN_CHARS } from "./header-search.js";

/**
 * @param {{ className?: string, debounceMs?: number }} props
 */
export function HeaderSearch({ className, debounceMs = 300 }) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), debounceMs);
    return () => window.clearTimeout(timer);
  }, [query, debounceMs]);

  useEffect(() => {
    const trimmed = debounced.trim();
    if (trimmed.length < HEADER_SEARCH_MIN_CHARS) {
      setPatients([]);
      setAppointments([]);
      setLoading(false);
      setFailed(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setOpen(true);
    fetchHeaderSearchResults(trimmed, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setPatients(result.patients);
        setAppointments(result.appointments);
        setFailed(result.failed && result.patients.length === 0 && result.appointments.length === 0);
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        setFailed(true);
        setPatients([]);
        setAppointments([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debounced]);

  useEffect(() => {
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function closeAndReset() {
    setOpen(false);
    setQuery("");
    setDebounced("");
  }

  function go(path) {
    closeAndReset();
    router.push(path);
  }

  const typed = query.trim();
  const pending = typed !== debounced.trim() && typed.length >= HEADER_SEARCH_MIN_CHARS;
  const showResults = open && typed.length >= HEADER_SEARCH_MIN_CHARS;
  const busy = loading || pending;
  const empty = !busy && !failed && patients.length === 0 && appointments.length === 0;

  return (
    <div
      ref={rootRef}
      className={cn("relative min-w-0", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <SearchInput
        value={query}
        onChange={(value) => {
          setQuery(value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={narrow ? "Search..." : "Search patients, appointments"}
        aria-label="Search patients, appointments"
        aria-expanded={showResults}
        aria-controls={listId}
        autoComplete="off"
        className="w-full"
      />
      {showResults ? (
        <div
          id={listId}
          role="listbox"
          data-testid="header-search-results"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-lg border border-border bg-card py-1 shadow-md"
        >
          {busy ? (
            <p className="px-3 py-2 text-sm font-medium text-muted-foreground">Searching…</p>
          ) : null}
          {!busy && failed ? (
            <p className="px-3 py-2 text-sm font-medium text-destructive" role="alert">
              Search failed
            </p>
          ) : null}
          {!busy && empty ? (
            <p className="px-3 py-2 text-sm font-medium text-muted-foreground">No results</p>
          ) : null}
          {!busy && patients.length > 0 ? (
            <section>
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Patients
              </p>
              {patients.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  role="option"
                  className="flex w-full cursor-pointer flex-col px-3 py-2 text-left hover:bg-muted"
                  onClick={() => go(`/patients/${encodeURIComponent(patient.id)}`)}
                >
                  <span className="text-sm font-medium text-foreground">{patient.name}</span>
                  {patient.phone ? (
                    <span className="text-xs font-medium text-muted-foreground">{patient.phone}</span>
                  ) : null}
                </button>
              ))}
            </section>
          ) : null}
          {!busy && appointments.length > 0 ? (
            <section>
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Appointments
              </p>
              {appointments.map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  role="option"
                  className="flex w-full cursor-pointer flex-col px-3 py-2 text-left hover:bg-muted"
                  onClick={() => go(`/appointments?appointmentId=${encodeURIComponent(appointment.id)}`)}
                >
                  <span className="text-sm font-medium text-foreground">
                    {appointment.patientName || "Appointment"}
                  </span>
                  {appointment.slotLabel ? (
                    <span className="text-xs font-medium text-muted-foreground">{appointment.slotLabel}</span>
                  ) : null}
                </button>
              ))}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
