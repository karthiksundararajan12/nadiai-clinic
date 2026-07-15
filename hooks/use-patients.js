"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPatients, createPatient as createPatientRequest } from "@/features/patients/patients.client";

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
      const payload = await fetchPatients({ signal });
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
      const payload = await createPatientRequest(patientInput);
      await load();
      return payload.patient;
    },
    [load],
  );

  return { patients, stats, loading, error, addPatient, refresh: load };
}
