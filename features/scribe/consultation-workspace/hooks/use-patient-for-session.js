"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Loads the clinic-scoped patient linked to a scribe session.
 * Maps public.patients columns onto the legacy UI shape (`name`, `age`, `phone`).
 * RLS: covered by "Doctors can read their clinic patients" (029_patients_clinic_rls).
 *
 * @param {string|null|undefined} patientId
 * @param {string|null|undefined} [clinicId] - optional extra scope when known from the session
 */
export function usePatientForSession(patientId, clinicId) {
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
    let query = supabase
      .from("patients")
      .select("id, clinic_id, full_name, age_years, gender, contact_phone, deleted_at")
      .eq("id", patientId)
      .is("deleted_at", null);

    if (clinicId) {
      query = query.eq("clinic_id", clinicId);
    }

    query
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) {
          setPatient(null);
          return;
        }
        setPatient({
          id: data.id,
          clinic_id: data.clinic_id,
          name: data.full_name,
          age: data.age_years ?? null,
          gender: data.gender ?? null,
          phone: data.contact_phone ?? null,
          // Not on the live patients schema — keep keys for existing UI.
          email: null,
          condition: null,
          status: null,
          last_visit: null,
          next_appointment: null,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [patientId, clinicId]);

  return { patient, loading };
}
