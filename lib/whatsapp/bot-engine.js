import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots, bookSlot } from "./slot-manager";
import { generatePaymentLink } from "./payment-handler";
import { generateInvoice } from "./invoice-generator";
import { notifyDoctor } from "./notification-service";
import { sendWhatsAppMessage, formatDate, formatTime } from "./utils";

const STATES = {
  WELCOME: "WELCOME",
  CHOOSE_LANGUAGE: "CHOOSE_LANGUAGE",
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

const CONSULTATION_FEE = 500;

const MSG = {
  hi: {
    welcome: (clinic) => `Namaste! 🙏 ${clinic} mein aapka swagat hai.\n\nPlease apni language choose karein:\n1. English\n2. हिंदी (Hindi)`,
    askName: "Kripya apna poora naam batayein.",
    askAge: (name) => `Dhanyavaad ${name} ji! Aapki age kitni hai?`,
    askGender: "Aapka gender batayein:\n1. Male\n2. Female\n3. Other",
    invalidAge: "Kripya apni age number mein batayein (jaise: 35).",
    invalidGender: "Kripya 1, 2, ya 3 mein se choose karein:\n1. Male\n2. Female\n3. Other",
    noSlots: "Abhi koi slot available nahi hai. Kripya kal try karein. 🙏",
    pickSlot: "Kripya slot number batayein (jaise: 1).",
    invalidSlot: (max) => `Kripya 1 se ${max} ke beech mein number batayein.`,
    slotUnavailable: "Sorry, yeh slot abhi available nahi hai. Kripya doosra slot choose karein.",
    booked: (date, time, fee, link) => `Bahut badhiya! Aapka slot ${date} ko ${time} par book ho gaya hai. ✅\n\nConsultation fee: ₹${fee}\nPayment link: ${link}\n\nPayment complete hone par aapko confirmation mil jayega.`,
    paymentPending: "Aapki payment abhi pending hai. Kripya payment link par click karke payment complete karein. 💳\n\nAgar aapne payment kar di hai, toh thoda wait karein — confirmation aa jayega.",
    alreadyConfirmed: "Aapka appointment already confirmed hai! ✅\n\nAgar aap reschedule karna chahte hain toh \"reschedule\" type karein.\nNaya appointment book karne ke liye \"hi\" type karein.",
    reschedule: "Koi baat nahi! Aap naya slot choose kar sakte hain:",
    noReply: "Namaste! Aapki pichli conversation timeout ho gayi thi.\nNaya appointment book karne ke liye \"hi\" type karein. 🙏",
    fallback: "Namaste! 🙏 Appointment book karne ke liye \"hi\" type karein.",
    slotsHeader: "Yeh slots available hain:\n\n",
  },
  en: {
    welcome: (clinic) => `Hello! 🙏 Welcome to ${clinic}.\n\nPlease choose your language:\n1. English\n2. हिंदी (Hindi)`,
    askName: "Please tell us your full name.",
    askAge: (name) => `Thank you ${name}! What is your age?`,
    askGender: "Please select your gender:\n1. Male\n2. Female\n3. Other",
    invalidAge: "Please enter your age as a number (e.g. 35).",
    invalidGender: "Please choose 1, 2, or 3:\n1. Male\n2. Female\n3. Other",
    noSlots: "No slots are available right now. Please try again tomorrow. 🙏",
    pickSlot: "Please reply with the slot number (e.g. 1).",
    invalidSlot: (max) => `Please enter a number between 1 and ${max}.`,
    slotUnavailable: "Sorry, this slot is no longer available. Please choose another one.",
    booked: (date, time, fee, link) => `Your slot on ${date} at ${time} has been booked! ✅\n\nConsultation fee: ₹${fee}\nPayment link: ${link}\n\nYou'll receive a confirmation once payment is done.`,
    paymentPending: "Your payment is still pending. Please click the payment link to complete. 💳\n\nIf you've already paid, please wait — confirmation will arrive shortly.",
    alreadyConfirmed: "Your appointment is already confirmed! ✅\n\nType \"reschedule\" to change your slot.\nType \"hi\" to book a new appointment.",
    reschedule: "No problem! You can choose a new slot:",
    noReply: "Hello! Your previous conversation timed out.\nType \"hi\" to book a new appointment. 🙏",
    fallback: "Hello! 🙏 Type \"hi\" to book an appointment.",
    slotsHeader: "Available slots:\n\n",
  },
};

/**
 * Main entry point — processes an incoming WhatsApp message for a doctor's
 * bot and returns one or more reply strings.
 */
export async function processMessage(phoneNumber, message, doctorId) {
  const supabase = getSupabaseAdminClient();
  const text = message.trim();

  let convo = await getOrCreateConversation(supabase, phoneNumber, doctorId);
  if (!convo) {
    return ["Sorry, we could not start your booking. Please try again in a moment."];
  }

  const profile = await getDoctorProfile(supabase, doctorId);
  const clinicName = profile?.clinic_name || "Clinic";
  const fee = Number(profile?.consultation_fee) || CONSULTATION_FEE;
  const lang = convo.selected_slot?.lang || "hi";
  const t = MSG[lang] || MSG.hi;

  await saveMessage(supabase, convo.id, doctorId, "inbound", text);

  let replies = [];

  if (text.toLowerCase() === "reschedule" && convo.appointment_id) {
    await updateConvo(supabase, convo.id, { state: STATES.RESCHEDULE });
    convo.state = STATES.RESCHEDULE;
  }

  if (text.toLowerCase() === "hi" || text.toLowerCase() === "hello" || text.toLowerCase() === "namaste") {
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
      replies.push(t.welcome(clinicName));
      await updateConvo(supabase, convo.id, { state: STATES.CHOOSE_LANGUAGE });
      break;
    }

    case STATES.CHOOSE_LANGUAGE: {
      let chosenLang = "hi";
      if (text === "1" || text.toLowerCase().includes("eng")) chosenLang = "en";
      if (text === "2" || text.toLowerCase().includes("hin")) chosenLang = "hi";

      const chosenT = MSG[chosenLang];
      await updateConvo(supabase, convo.id, {
        state: STATES.COLLECT_NAME,
        selected_slot: { lang: chosenLang },
      });
      replies.push(chosenT.askName);
      break;
    }

    case STATES.COLLECT_NAME: {
      const name = text;
      if (name.length < 2) {
        replies.push(t.askName);
        break;
      }
      await updateConvo(supabase, convo.id, {
        patient_name: name,
        state: STATES.COLLECT_AGE,
      });
      replies.push(t.askAge(name));
      break;
    }

    case STATES.COLLECT_AGE: {
      const age = parseInt(text, 10);
      if (isNaN(age) || age < 1 || age > 150) {
        replies.push(t.invalidAge);
        break;
      }
      await updateConvo(supabase, convo.id, {
        patient_age: age,
        state: STATES.COLLECT_GENDER,
      });
      replies.push(t.askGender);
      break;
    }

    case STATES.COLLECT_GENDER: {
      const gender = parseGender(text);
      if (!gender) {
        replies.push(t.invalidGender);
        break;
      }
      await updateConvo(supabase, convo.id, {
        patient_gender: gender,
        state: STATES.SHOW_SLOTS,
      });

      const slotsReply = await buildSlotsMessage(doctorId, convo.id, supabase, t);
      replies.push(slotsReply);
      break;
    }

    case STATES.SHOW_SLOTS: {
      const slotsReply = await buildSlotsMessage(doctorId, convo.id, supabase, t);
      replies.push(slotsReply);
      break;
    }

    case STATES.CONFIRM_SLOT: {
      const slotIndex = parseInt(text, 10);
      const convoFull = await getConversation(supabase, convo.id);
      const savedSlots = convoFull?.selected_slot?.slots;

      if (!savedSlots || isNaN(slotIndex) || slotIndex < 1 || slotIndex > savedSlots.length) {
        replies.push(t.invalidSlot(savedSlots?.length || "?"));
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
        replies.push(t.slotUnavailable);
        const refreshed = await buildSlotsMessage(doctorId, convo.id, supabase, t);
        replies.push(refreshed);
        break;
      }

      const payResult = await generatePaymentLink(
        bookResult.appointment.id,
        fee,
        convoFull.patient_name,
        phoneNumber,
        doctorId
      );

      await updateConvo(supabase, convo.id, {
        appointment_id: bookResult.appointment.id,
        payment_id: payResult.paymentId || null,
        selected_slot: { ...convoFull.selected_slot, slots: savedSlots },
        state: STATES.AWAITING_PAYMENT,
      });

      replies.push(t.booked(formatDate(chosen.date), formatTime(chosen.time), fee, payResult.paymentLink));

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
      replies.push(t.paymentPending);
      break;
    }

    case STATES.COMPLETED: {
      replies.push(t.alreadyConfirmed);
      break;
    }

    case STATES.RESCHEDULE: {
      const slotsReply = await buildSlotsMessage(doctorId, convo.id, supabase, t);
      replies.push(`${t.reschedule}\n\n${slotsReply}`);
      break;
    }

    case STATES.NO_REPLY: {
      replies.push(t.noReply);
      break;
    }

    default: {
      replies.push(t.fallback);
    }
  }

  await supabase
    .from("whatsapp_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", convo.id);

  for (const reply of replies) {
    await saveMessage(supabase, convo.id, doctorId, "outbound", reply);
  }

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

  await saveMessage(supabase, convo.id, convo.doctor_id, "outbound", message);
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
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("whatsapp_conversations")
    .insert({
      phone,
      doctor_id: doctorId,
      state: STATES.WELCOME,
    })
    .select()
    .single();

  if (error) {
    console.error("[Bot] Failed to create conversation:", error.message);
    return null;
  }

  return created;
}

async function saveMessage(supabase, conversationId, doctorId, direction, message) {
  const { error } = await supabase.from("wa_messages").insert({
    conversation_id: conversationId,
    doctor_id: doctorId,
    direction,
    message,
  });

  if (error) {
    console.error("[Bot] Failed to save message:", error.message);
  }
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
    .select("full_name, clinic_name, clinic_address, phone, consultation_duration, consultation_fee")
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

async function buildSlotsMessage(doctorId, convoId, supabase, t) {
  const { slots, error } = await getAvailableSlots(doctorId);

  if (error || slots.length === 0) {
    return t.noSlots;
  }

  const display = slots.slice(0, 10);
  const convoFull = await getConversation(supabase, convoId);
  const existingLang = convoFull?.selected_slot?.lang || "hi";

  await updateConvo(supabase, convoId, {
    selected_slot: { slots: display, lang: existingLang },
    state: STATES.CONFIRM_SLOT,
  });

  let msg = t.slotsHeader;
  display.forEach((s, i) => {
    msg += `${i + 1}. ${formatDate(s.date)} - ${formatTime(s.time)}\n`;
  });
  msg += `\n${t.pickSlot}`;

  return msg;
}

function parseGender(text) {
  const t = text.trim().toLowerCase();
  if (t === "1" || t === "m" || t === "male") return "Male";
  if (t === "2" || t === "f" || t === "female") return "Female";
  if (t === "3" || t === "other") return "Other";
  return null;
}
