"use client";

import { useCallback, useEffect, useState } from "react";

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load patients");
  }
  return payload;
}

const EMPTY_STATS = {
  totalPatients: 0,
  withUpcomingVisit: 0,
  noAppointmentsYet: 0,
};

export function usePatients() {
  const [patients, setPatients] = useState([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await readResponse(
        await fetch("/api/patients", { cache: "no-store", signal }),
      );
      setPatients(payload.patients ?? []);
      setStats(payload.stats ?? EMPTY_STATS);
    } catch (loadError) {
      if (loadError.name !== "AbortError") {
        setError(loadError);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const addPatient = useCallback(
    async (patientInput) => {
      setError(null);
      const payload = await readResponse(
        await fetch("/api/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patientInput),
        }),
      );
      await load();
      return payload.patient;
    },
    [load],
  );

  return { patients, stats, loading, error, addPatient, refresh: load };
}
