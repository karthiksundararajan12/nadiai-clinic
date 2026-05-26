import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots, bookSlot } from "./slot-manager";
import { generatePaymentLink } from "./payment-handler";
import { generateInvoice } from "./invoice-generator";
import { notifyDoctor } from "./notification-service";
import { sendWhatsAppMessage, formatDate, formatTime } from "./utils";

const STATES = {
  WELCOME: "WELCOME",
  COLLECT_NAME: "COLLECT_NAME",
  COLLECT_AGE: "COLLECT_AGE",
  COLLECT_GENDER: "COLLECT_GENDER",
  SHOW_SLOTS: "SHOW_SLOTS",
  CONFIRM_SLOT: "CONFIRM_SLOT",
  AWAITING_PAYMENT: "AWAITING_PAYMENT",
  COMPLETED: "COMPLETED",
  RESCHEDULE: "RESCHEDULE",
  NO_REPLY: "NO_REPLY",
};

const CONSULTATION_FEE = 500; // default ₹500, override from doctor profile later

/**
 * Main entry point — processes an incoming WhatsApp message for a doctor's
 * bot and returns one or more reply strings.
 */
export async function processMessage(phoneNumber, message, doctorId) {
  const supabase = getSupabaseAdminClient();
  const text = message.trim();

  let convo = await getOrCreateConversation(supabase, phoneNumber, doctorId);
  const profile = await getDoctorProfile(supabase, doctorId);
  const clinicName = profile?.clinic_name || "Clinic";

  let replies = [];

  if (text.toLowerCase() === "reschedule" && convo.appointment_id) {
    await updateConvo(supabase, convo.id, { state: STATES.RESCHEDULE });
    convo.state = STATES.RESCHEDULE;
  }

  if (text.toLowerCase() === "hi" || text.toLowerCase() === "hello") {
    if (convo.state === STATES.COMPLETED || convo.state === STATES.NO_REPLY) {
      await updateConvo(supabase, convo.id, {
        state: STATES.WELCOME,
        patient_name: null,
        patient_age: null,
        patient_gender: null,
        selected_slot: null,
        appointment_id: null,
        payment_id: null,
      });
      convo.state = STATES.WELCOME;
    }
  }

  switch (convo.state) {
    case STATES.WELCOME: {
      replies.push(
        `Namaste! 🙏 Welcome to ${clinicName}. Main aapki appointment book karne mein madad karungi.\n\nKripya apna naam batayein.`
      );
      await updateConvo(supabase, convo.id, { state: STATES.COLLECT_NAME });
      break;
    }

    case STATES.COLLECT_NAME: {
      const name = text;
      if (name.length < 2) {
        replies.push("Kripya apna poora naam batayein.");
        break;
      }
      await updateConvo(supabase, convo.id, {
        patient_name: name,
        state: STATES.COLLECT_AGE,
      });
      replies.push(`Dhanyavaad ${name} ji! Aapki age kitni hai?`);
      break;
    }

    case STATES.COLLECT_AGE: {
      const age = parseInt(text, 10);
      if (isNaN(age) || age < 1 || age > 150) {
        replies.push("Kripya apni age number mein batayein (jaise: 35).");
        break;
      }
      await updateConvo(supabase, convo.id, {
        patient_age: age,
        state: STATES.COLLECT_GENDER,
      });
      replies.push(
        "Aapka gender batayein:\n1. Male\n2. Female\n3. Other"
      );
      break;
    }

    case STATES.COLLECT_GENDER: {
      const gender = parseGender(text);
      if (!gender) {
        replies.push(
          "Kripya 1, 2, ya 3 mein se choose karein:\n1. Male\n2. Female\n3. Other"
        );
        break;
      }
      await updateConvo(supabase, convo.id, {
        patient_gender: gender,
        state: STATES.SHOW_SLOTS,
      });

      const slotsReply = await buildSlotsMessage(doctorId, convo.id, supabase);
      replies.push(`Dhanyavaad! ${slotsReply}`);
      break;
    }

    case STATES.SHOW_SLOTS: {
      const slotsReply = await buildSlotsMessage(doctorId, convo.id, supabase);
      replies.push(slotsReply);
      break;
    }

    case STATES.CONFIRM_SLOT: {
      const slotIndex = parseInt(text, 10);
      const convoFull = await getConversation(supabase, convo.id);
      const savedSlots = convoFull?.selected_slot?.slots;

      if (!savedSlots || isNaN(slotIndex) || slotIndex < 1 || slotIndex > savedSlots.length) {
        replies.push(
          `Kripya 1 se ${savedSlots?.length || "?"} ke beech mein number batayein.`
        );
        break;
      }

      const chosen = savedSlots[slotIndex - 1];

      const bookResult = await bookSlot(
        doctorId,
        {
          name: convoFull.patient_name,
          age: convoFull.patient_age,
          gender: convoFull.patient_gender,
          phone: phoneNumber,
        },
        chosen.date,
        chosen.time
      );

      if (!bookResult.success) {
        replies.push(
          `Sorry, yeh slot abhi available nahi hai. Kripya doosra slot choose karein.`
        );
        const refreshed = await buildSlotsMessage(doctorId, convo.id, supabase);
        replies.push(refreshed);
        break;
      }

      const payResult = await generatePaymentLink(
        bookResult.appointment.id,
        CONSULTATION_FEE,
        convoFull.patient_name,
        phoneNumber,
        doctorId
      );

      await updateConvo(supabase, convo.id, {
        appointment_id: bookResult.appointment.id,
        payment_id: payResult.paymentId || null,
        state: STATES.AWAITING_PAYMENT,
      });

      replies.push(
        `Bahut badhiya! Aapka slot ${formatDate(chosen.date)} ko ${formatTime(chosen.time)} par book ho gaya hai. ✅\n\n` +
        `Consultation fee: ₹${CONSULTATION_FEE}\n` +
        `Payment link: ${payResult.paymentLink}\n\n` +
        `Payment complete hone par aapko confirmation mil jayega.`
      );

      await notifyDoctor(doctorId, {
        type: "new_booking",
        message: `New WhatsApp booking: ${convoFull.patient_name} on ${formatDate(chosen.date)} at ${formatTime(chosen.time)}`,
        metadata: {
          patient_name: convoFull.patient_name,
          phone: phoneNumber,
          date: chosen.date,
          time: chosen.time,
          appointment_id: bookResult.appointment.id,
        },
      });

      break;
    }

    case STATES.AWAITING_PAYMENT: {
      replies.push(
        "Aapki payment abhi pending hai. Kripya payment link par click karke payment complete karein. 💳\n\n" +
        "Agar aapne payment kar di hai, toh thoda wait karein — confirmation aa jayega."
      );
      break;
    }

    case STATES.COMPLETED: {
      replies.push(
        "Aapka appointment already confirmed hai! ✅\n\n" +
        'Agar aap reschedule karna chahte hain toh "reschedule" type karein.\n' +
        'Naya appointment book karne ke liye "hi" type karein.'
      );
      break;
    }

    case STATES.RESCHEDULE: {
      const slotsReply = await buildSlotsMessage(doctorId, convo.id, supabase);
      replies.push(
        `Koi baat nahi! Aap naya slot choose kar sakte hain:\n\n${slotsReply}`
      );
      break;
    }

    case STATES.NO_REPLY: {
      replies.push(
        `Namaste! Aapki pichli conversation timeout ho gayi thi.\n` +
        'Naya appointment book karne ke liye "hi" type karein. 🙏'
      );
      break;
    }

    default: {
      replies.push(
        `Namaste! 🙏 Appointment book karne ke liye "hi" type karein.`
      );
    }
  }

  await supabase
    .from("whatsapp_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", convo.id);

  return replies;
}

/**
 * Called when payment is confirmed — transitions conversation to COMPLETED
 * and sends the patient a confirmation + invoice summary.
 */
export async function handlePaymentConfirmed(conversationId) {
  const supabase = getSupabaseAdminClient();

  const { data: convo } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (!convo) return;

  await updateConvo(supabase, convo.id, { state: STATES.COMPLETED });

  const { data: appt } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", convo.appointment_id)
    .single();

  const profile = await getDoctorProfile(supabase, convo.doctor_id);
  const invoiceResult = await generateInvoice(convo.appointment_id);

  let message =
    `Payment received! ✅ Aapka appointment confirmed hai.\n\n` +
    `📋 Details:\n` +
    `Doctor: Dr. ${profile?.full_name || "Doctor"}\n` +
    `Clinic: ${profile?.clinic_name || ""}\n` +
    `Date: ${appt ? formatDate(appt.date) : ""}\n` +
    `Time: ${appt ? formatTime(appt.time) : ""}\n`;

  if (invoiceResult.success) {
    message += `Invoice: #${invoiceResult.invoice.invoice_number}\n`;
  }

  message += `\nDhanyavaad! Apna khayal rakhein. 🙏`;

  await sendWhatsAppMessage(convo.phone, message, convo.doctor_id);
}

// ── Internal helpers ─────────────────────────────────────────

async function getOrCreateConversation(supabase, phone, doctorId) {
  const { data: existing } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("phone", phone)
    .eq("doctor_id", doctorId)
    .neq("state", "COMPLETED")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) return existing;

  const { data: created } = await supabase
    .from("whatsapp_conversations")
    .insert({
      phone,
      doctor_id: doctorId,
      state: STATES.WELCOME,
    })
    .select()
    .single();

  return created;
}

async function getConversation(supabase, convoId) {
  const { data } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("id", convoId)
    .single();
  return data;
}

async function getDoctorProfile(supabase, doctorId) {
  const { data } = await supabase
    .from("doctor_profiles")
    .select("full_name, clinic_name, clinic_address, phone, consultation_duration")
    .eq("user_id", doctorId)
    .single();
  return data;
}

async function updateConvo(supabase, convoId, fields) {
  await supabase
    .from("whatsapp_conversations")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", convoId);
}

async function buildSlotsMessage(doctorId, convoId, supabase) {
  const { slots, error } = await getAvailableSlots(doctorId);

  if (error || slots.length === 0) {
    return "Abhi koi slot available nahi hai. Kripya kal try karein. 🙏";
  }

  const display = slots.slice(0, 10);

  await updateConvo(supabase, convoId, {
    selected_slot: { slots: display },
    state: STATES.CONFIRM_SLOT,
  });

  let msg = "Yeh slots available hain:\n\n";
  display.forEach((s, i) => {
    msg += `${i + 1}. ${formatDate(s.date)} - ${formatTime(s.time)}\n`;
  });
  msg += "\nKripya slot number batayein (jaise: 1).";

  return msg;
}

function parseGender(text) {
  const t = text.trim().toLowerCase();
  if (t === "1" || t === "m" || t === "male") return "Male";
  if (t === "2" || t === "f" || t === "female") return "Female";
  if (t === "3" || t === "other") return "Other";
  return null;
}
