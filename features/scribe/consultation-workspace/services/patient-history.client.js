"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Last 3 consultations for a patient from soap_notes.
 * @param {string} patientId
 */
export async function fetchPatientConsultationHistory(patientId) {
  if (!patientId) return [];

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("soap_notes")
    .select("id, session_id, chief_complaint, assessment, status, created_at, approved_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    chiefComplaint: row.chief_complaint ?? row.assessment?.slice?.(0, 80) ?? "Consultation",
    status: row.status,
    date: row.approved_at ?? row.created_at,
  }));
}
