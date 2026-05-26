import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Generates a payment link for an appointment.
 * Currently a mock — swap the link generation logic for Razorpay / Stripe
 * when ready.
 */
export async function generatePaymentLink(
  appointmentId,
  amount,
  patientName,
  patientPhone,
  doctorId
) {
  const supabase = getSupabaseAdminClient();

  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      appointment_id: appointmentId,
      doctor_id: doctorId,
      patient_name: patientName,
      patient_phone: patientPhone,
      amount,
      status: "pending",
      payment_link: `${BASE_URL}/pay/${appointmentId}`,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: "Failed to create payment record" };
  }

  // TODO: Replace with real payment gateway integration
  // const razorpayLink = await razorpay.paymentLink.create({ ... });

  return {
    success: true,
    paymentId: payment.id,
    paymentLink: payment.payment_link,
    amount,
  };
}

/**
 * Processes a payment confirmation callback from the gateway.
 */
export async function processPaymentCallback(
  paymentId,
  status,
  paymentMode
) {
  const supabase = getSupabaseAdminClient();

  const { data: payment, error: fetchErr } = await supabase
    .from("payments")
    .select("*, appointments(*)")
    .eq("id", paymentId)
    .single();

  if (fetchErr || !payment) {
    return { success: false, error: "Payment record not found" };
  }

  const isPaid = status === "paid" || status === "success";

  const { error: updateErr } = await supabase
    .from("payments")
    .update({
      status: isPaid ? "paid" : "failed",
      payment_mode: paymentMode,
      paid_at: isPaid ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  if (updateErr) {
    return { success: false, error: "Failed to update payment" };
  }

  if (isPaid && payment.appointment_id) {
    await supabase
      .from("appointments")
      .update({
        status: "confirmed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.appointment_id);
  }

  return {
    success: true,
    payment: {
      ...payment,
      status: isPaid ? "paid" : "failed",
      payment_mode: paymentMode,
    },
  };
}

/**
 * Returns the current status of a payment.
 */
export async function getPaymentStatus(paymentId) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("payments")
    .select("id, status, amount, payment_mode, paid_at")
    .eq("id", paymentId)
    .single();

  if (error) return { found: false };
  return { found: true, ...data };
}
