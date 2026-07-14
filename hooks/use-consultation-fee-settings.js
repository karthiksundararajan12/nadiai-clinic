"use client";

import { useCallback, useEffect, useState } from "react";

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load consultation fee");
  }
  return payload;
}

export function useConsultationFeeSettings() {
  const [consultationFee, setConsultationFee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await readResponse(
        await fetch("/api/doctor-profile", { cache: "no-store", signal }),
      );
      setConsultationFee(payload.consultationFee ?? null);
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

  const saveConsultationFee = useCallback(async (fee) => {
    setError(null);
    const payload = await readResponse(
      await fetch("/api/doctor-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultationFee: fee }),
      }),
    );
    setConsultationFee(payload.consultationFee ?? null);
    return payload;
  }, []);

  return {
    consultationFee,
    loading,
    error,
    saveConsultationFee,
    refresh: load,
  };
}
