"use client";

import { useCallback, useEffect, useState } from "react";

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Appointment request failed");
  }
  return payload;
}

async function fetchAppointments(scope, signal) {
  const response = await fetch(
    `/api/appointments?scope=${encodeURIComponent(scope)}`,
    { cache: "no-store", signal },
  );
  return readResponse(response);
}

export function useAppointmentsData(scope = "all") {
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchAppointments(scope, signal);
      setAppointments(payload.appointments ?? []);
      setPatients(payload.patients ?? []);
    } catch (loadError) {
      if (loadError.name !== "AbortError") {
        setError(loadError);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadInitialAppointments() {
      try {
        const payload = await fetchAppointments(scope, controller.signal);
        setAppointments(payload.appointments ?? []);
        setPatients(payload.patients ?? []);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError(loadError);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadInitialAppointments();
    return () => controller.abort();
  }, [scope]);

  const mutate = useCallback(async (method, body) => {
    setError(null);
    const response = await fetch("/api/appointments", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await readResponse(response);
    await load();
    return payload.appointment;
  }, [load]);

  const addAppointment = useCallback(
    (appointment) => mutate("POST", appointment),
    [mutate],
  );

  const cancelAppointment = useCallback(
    (appointmentId) =>
      mutate("PATCH", { action: "cancel", appointmentId }),
    [mutate],
  );

  const updateAppointment = useCallback(
    (appointmentId, updates) =>
      mutate("PATCH", {
        action: "reschedule",
        appointmentId,
        ...updates,
      }),
    [mutate],
  );

  return {
    appointments,
    patients,
    loading,
    error,
    refresh: load,
    addAppointment,
    updateAppointment,
    cancelAppointment,
  };
}

