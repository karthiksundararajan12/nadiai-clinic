import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const NOTIFICATION_TITLES = {
  new_booking: "New WhatsApp Booking",
  payment_received: "Payment Received",
  no_reply_escalation: "Patient Not Responding",
  cancellation: "Appointment Cancelled",
  reschedule: "Appointment Rescheduled",
};

/**
 * Creates a notification record for a doctor.
 */
export async function notifyDoctor(doctorId, notification) {
  const supabase = getSupabaseAdminClient();

  const { type, message, metadata = {} } = notification;

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      doctor_id: doctorId,
      type,
      title: NOTIFICATION_TITLES[type] || "Notification",
      message,
      metadata,
    })
    .select()
    .single();

  if (error) {
    console.error("[Notification] Failed to create:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true, notification: data };
}

/**
 * Fetches recent notifications for a doctor, newest first.
 */
export async function getDoctorNotifications(doctorId, limit = 50) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("doctor_id", doctorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data;
}

/**
 * Marks a single notification as read.
 */
export async function markNotificationRead(notificationId) {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);

  return { success: !error };
}
