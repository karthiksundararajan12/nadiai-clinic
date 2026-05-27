import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage, formatTime } from "./utils";
import { notifyDoctor } from "./notification-service";

const REMINDER_WINDOW_MINUTES = 30;
const NO_REPLY_TIMEOUT_MINUTES = 10;

/**
 * Checks for appointments starting within the next 30 minutes and sends
 * WhatsApp reminders to patients. Returns the list of reminded appointments.
 */
export async function checkAndSendReminders(doctorId) {
  const supabase = getSupabaseAdminClient();

  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60_000);
  const todayStr = now.toISOString().split("T")[0];

  const { data: appointments } = await supabase
    .from("appointments")
    .select("*, patients(phone, name)")
    .eq("doctor_id", doctorId)
    .eq("date", todayStr)
    .in("status", ["scheduled", "confirmed"]);

  if (!appointments?.length) return { reminders: [] };

  const { data: profile } = await supabase
    .from("doctor_profiles")
    .select("full_name, clinic_name, clinic_id")
    .eq("user_id", doctorId)
    .single();

  const doctorName = profile?.full_name || "Doctor";
  const reminded = [];

  for (const appt of appointments) {
    const [h, m] = appt.time.split(":").map(Number);
    const apptTime = new Date(todayStr);
    apptTime.setHours(h, m, 0, 0);

    const diffMs = apptTime.getTime() - now.getTime();
    const diffMin = diffMs / 60_000;

    if (diffMin > 0 && diffMin <= REMINDER_WINDOW_MINUTES) {
      const phone = appt.patients?.phone;
      if (!phone) continue;

      const message =
        `Reminder: Aapka appointment Dr. ${doctorName} ke saath ` +
        `aaj ${formatTime(appt.time)} ko hai. Kripya time par pahunchein. 🏥`;

      await sendWhatsAppMessage(phone, message, doctorId, profile?.clinic_id);
      reminded.push(appt);
    }
  }

  return { reminders: reminded };
}

/**
 * Escalates a conversation to the doctor when the patient hasn't
 * replied within the timeout window.
 */
export async function handleNoReply(conversationId) {
  const supabase = getSupabaseAdminClient();

  const { data: convo } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (!convo) return { escalated: false, error: "Conversation not found" };

  const lastMsg = new Date(convo.last_message_at);
  const elapsed = (Date.now() - lastMsg.getTime()) / 60_000;

  if (elapsed < NO_REPLY_TIMEOUT_MINUTES) {
    return { escalated: false, reason: "Timeout not reached" };
  }

  await supabase
    .from("whatsapp_conversations")
    .update({ state: "NO_REPLY", updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  await notifyDoctor(convo.doctor_id, {
    type: "no_reply_escalation",
    message: `Patient ${convo.patient_name || convo.phone} ne ${Math.round(elapsed)} min se reply nahi kiya. Phone: ${convo.phone}`,
    metadata: {
      phone: convo.phone,
      patient_name: convo.patient_name,
      conversation_id: conversationId,
    },
  });

  return { escalated: true, phone: convo.phone };
}

/**
 * Lists appointments that need reminders (within next 30 min,
 * not yet reminded).
 */
export async function getUpcomingReminders(doctorId) {
  const supabase = getSupabaseAdminClient();

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const { data: appointments } = await supabase
    .from("appointments")
    .select("*, patients(phone, name)")
    .eq("doctor_id", doctorId)
    .eq("date", todayStr)
    .in("status", ["scheduled", "confirmed"])
    .order("time", { ascending: true });

  if (!appointments?.length) return [];

  return appointments.filter((appt) => {
    const [h, m] = appt.time.split(":").map(Number);
    const apptTime = new Date(todayStr);
    apptTime.setHours(h, m, 0, 0);
    const diffMin = (apptTime.getTime() - now.getTime()) / 60_000;
    return diffMin > 0 && diffMin <= REMINDER_WINDOW_MINUTES;
  });
}
