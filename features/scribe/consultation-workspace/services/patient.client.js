"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export async function searchPatients(query) {
  const q = String(query ?? "").trim();
  if (q.length < 2) return [];

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("patients")
    .select("id, name, age, gender, phone, last_visit, condition")
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(8);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPatient({ name, phone, age, gender }) {
  const supabase = getSupabaseBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: doctor } = await supabase
    .from("doctors")
    .select("id")
    .eq("user_id", user.id)
    .single();

  const { data, error } = await supabase
    .from("patients")
    .insert({
      doctor_id: doctor?.id ?? user.id,
      name: name.trim(),
      phone: phone.trim(),
      age: Number(age) || null,
      gender: gender ?? null,
      status: "active",
    })
    .select("id, name, age, gender, phone, last_visit, condition")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function attachPatientToSession(sessionId, patientId) {
  const res = await fetch(`/api/scribe/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update", patient_id: patientId }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `Failed to attach patient (${res.status})`);
  return payload;
}
