"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function usePatientForSession(patientId) {
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(Boolean(patientId));

  useEffect(() => {
    if (!patientId) {
      setPatient(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const supabase = getSupabaseBrowserClient();
    supabase
      .from("patients")
      .select("id, name, age, gender, phone, email, condition, status, last_visit, next_appointment")
      .eq("id", patientId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setPatient(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [patientId]);

  return { patient, loading };
}
