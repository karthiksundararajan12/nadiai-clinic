import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Fetches available appointment slots for a doctor on a given date.
 * Generates time slots from working hours, then excludes already-booked ones.
 */
export async function getAvailableSlots(doctorId, date) {
  const supabase = getSupabaseAdminClient();
  const targetDate = date || getNextWorkingDate();

  const { data: profile, error: profileErr } = await supabase
    .from("doctor_profiles")
    .select(
      "consultation_duration, working_hours_start, working_hours_end, clinic_name"
    )
    .eq("user_id", doctorId)
    .single();

  if (profileErr || !profile) {
    return { slots: [], error: "Doctor profile not found" };
  }

  const {
    consultation_duration: duration,
    working_hours_start: start,
    working_hours_end: end,
  } = profile;

  const allSlots = generateTimeSlots(start, end, duration);

  const { data: booked } = await supabase
    .from("appointments")
    .select("time")
    .eq("doctor_id", doctorId)
    .eq("date", targetDate)
    .in("status", ["scheduled", "confirmed"]);

  const bookedTimes = new Set((booked || []).map((a) => a.time));
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const available = allSlots.filter((slot) => {
    if (bookedTimes.has(slot)) return false;
    if (targetDate === todayStr) {
      const [h, m] = slot.split(":").map(Number);
      const slotMinutes = h * 60 + m;
      const nowMinutes = now.getHours() * 60 + now.getMinutes() + 30;
      if (slotMinutes <= nowMinutes) return false;
    }
    return true;
  });

  return {
    slots: available.map((time) => ({ date: targetDate, time })),
    clinicName: profile.clinic_name,
    duration,
  };
}

/**
 * Returns available slots across a date range.
 */
export async function getSlotsByDateRange(doctorId, startDate, endDate) {
  const results = {};
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0];
    const { slots } = await getAvailableSlots(doctorId, dateStr);
    if (slots.length > 0) {
      results[dateStr] = slots;
    }
    current.setDate(current.getDate() + 1);
  }

  return results;
}

/**
 * Books a slot: creates patient record if new, then creates the appointment.
 */
export async function bookSlot(doctorId, patientData, slotDate, slotTime) {
  const supabase = getSupabaseAdminClient();

  const { slots } = await getAvailableSlots(doctorId, slotDate);
  const isAvailable = slots.some(
    (s) => s.date === slotDate && s.time === slotTime
  );
  if (!isAvailable) {
    return { success: false, error: "Slot is no longer available" };
  }

  let patientId;
  const { data: existing } = await supabase
    .from("patients")
    .select("id")
    .eq("doctor_id", doctorId)
    .eq("phone", patientData.phone)
    .single();

  if (existing) {
    patientId = existing.id;
    await supabase
      .from("patients")
      .update({
        name: patientData.name,
        age: patientData.age,
        gender: patientData.gender,
        next_appointment: slotDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", patientId);
  } else {
    const { data: newPatient, error: patientErr } = await supabase
      .from("patients")
      .insert({
        doctor_id: doctorId,
        name: patientData.name,
        age: patientData.age,
        gender: patientData.gender,
        phone: patientData.phone,
        status: "active",
        next_appointment: slotDate,
      })
      .select("id")
      .single();

    if (patientErr) {
      return { success: false, error: "Failed to create patient record" };
    }
    patientId = newPatient.id;
  }

  const { data: appointment, error: apptErr } = await supabase
    .from("appointments")
    .insert({
      doctor_id: doctorId,
      patient_id: patientId,
      patient_name: patientData.name,
      date: slotDate,
      time: slotTime,
      type: "Consultation",
      status: "scheduled",
      source: "whatsapp",
    })
    .select()
    .single();

  if (apptErr) {
    return { success: false, error: "Failed to create appointment" };
  }

  return { success: true, appointment, patientId };
}

/**
 * Reschedules an existing appointment to a new date/time.
 */
export async function rescheduleAppointment(appointmentId, newDate, newTime) {
  const supabase = getSupabaseAdminClient();

  const { data: appt } = await supabase
    .from("appointments")
    .select("doctor_id")
    .eq("id", appointmentId)
    .single();

  if (!appt) {
    return { success: false, error: "Appointment not found" };
  }

  const { slots } = await getAvailableSlots(appt.doctor_id, newDate);
  const isAvailable = slots.some(
    (s) => s.date === newDate && s.time === newTime
  );
  if (!isAvailable) {
    return { success: false, error: "New slot is not available" };
  }

  const { error } = await supabase
    .from("appointments")
    .update({
      date: newDate,
      time: newTime,
      status: "scheduled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);

  if (error) {
    return { success: false, error: "Failed to reschedule" };
  }

  return { success: true };
}

// ── Helpers ──────────────────────────────────────────────────

function generateTimeSlots(start, end, durationMin) {
  const slots = [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let current = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  while (current + durationMin <= endMinutes) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    current += durationMin;
  }

  return slots;
}

function getNextWorkingDate() {
  const d = new Date();
  // If past 5 PM, use tomorrow
  if (d.getHours() >= 17) {
    d.setDate(d.getDate() + 1);
  }
  // Skip weekends
  while (d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0];
}
