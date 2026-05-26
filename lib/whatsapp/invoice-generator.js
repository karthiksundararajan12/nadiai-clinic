import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatTime, generateInvoiceNumber } from "./utils";

/**
 * Generates structured invoice data for a confirmed appointment.
 * The frontend renders this data — no PDF generation here.
 */
export async function generateInvoice(appointmentId) {
  const supabase = getSupabaseAdminClient();

  const { data: appointment, error: apptErr } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();

  if (apptErr || !appointment) {
    return { success: false, error: "Appointment not found" };
  }

  const { data: profile } = await supabase
    .from("doctor_profiles")
    .select("full_name, clinic_name, clinic_address, specialization, phone")
    .eq("user_id", appointment.doctor_id)
    .single();

  const { data: payment } = await supabase
    .from("payments")
    .select("amount, payment_mode, paid_at")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const invoice = {
    invoice_number: generateInvoiceNumber(),
    appointment_id: appointmentId,
    date: formatDate(appointment.date),
    time: formatTime(appointment.time),
    patient_name: appointment.patient_name,
    doctor_name: profile?.full_name || "Doctor",
    clinic_name: profile?.clinic_name || "",
    clinic_address: profile?.clinic_address || "",
    specialization: profile?.specialization || "",
    clinic_phone: profile?.phone || "",
    amount: payment?.amount || 0,
    payment_mode: payment?.payment_mode || "N/A",
    paid_at: payment?.paid_at ? formatDate(payment.paid_at) : null,
    type: appointment.type,
    duration: appointment.duration,
    status: appointment.status,
    generated_at: new Date().toISOString(),
  };

  return { success: true, invoice };
}
