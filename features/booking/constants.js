/**
 * @fileoverview WhatsApp Booking Bot domain constants.
 * Single source of truth for state machines, enums, and configuration
 * values used across the booking feature.
 *
 * Schema reference: ARCHITECTURE.md (validated against the live
 * `nadiai-clinic` Supabase project on 2026-07-03).
 */

// ─────────────────────────────────────────────────────────────
// CONVERSATION STATE MACHINE
// (public.conversation_state.current_state — pre-appointment bot flow)
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const CONVERSATION_STATE = Object.freeze({
  START:               "START",
  COLLECTING_PATIENT:  "COLLECTING_PATIENT",
  SLOT_SELECTION:      "SLOT_SELECTION",
  PAYMENT_PENDING:     "PAYMENT_PENDING",
  CONFIRMED:           "CONFIRMED",
  HUMAN_HANDOFF:       "HUMAN_HANDOFF",
});

/**
 * Defines every valid conversation_state transition.
 * Key = current state; Value = array of permitted next states.
 * Any transition NOT in this map is rejected by the service layer.
 *
 * START, COLLECTING_PATIENT, and SLOT_SELECTION's outbound edges are
 * exercised today (Sessions 1-3). PAYMENT_PENDING / CONFIRMED are entered
 * by SLOT_SELECTION but their own outbound edges (beyond HUMAN_HANDOFF)
 * are forward references for Session 4+ — no handler builds on them yet.
 *
 * @type {Record<string, string[]>}
 */
export const VALID_CONVERSATION_TRANSITIONS = Object.freeze({
  [CONVERSATION_STATE.START]: [
    CONVERSATION_STATE.START, // re-prompt (retry) — stays in START
    CONVERSATION_STATE.COLLECTING_PATIENT,
    CONVERSATION_STATE.SLOT_SELECTION, // reminder Reschedule self-serve
    CONVERSATION_STATE.HUMAN_HANDOFF,
  ],
  [CONVERSATION_STATE.COLLECTING_PATIENT]: [
    CONVERSATION_STATE.SLOT_SELECTION,
    CONVERSATION_STATE.HUMAN_HANDOFF,
    CONVERSATION_STATE.START,
  ],
  [CONVERSATION_STATE.SLOT_SELECTION]: [
    CONVERSATION_STATE.COLLECTING_PATIENT,
    CONVERSATION_STATE.PAYMENT_PENDING,
    CONVERSATION_STATE.CONFIRMED,
    CONVERSATION_STATE.HUMAN_HANDOFF,
    // Global reset keywords ("restart" / "start over" / …) — conversation
    // flow only. Patient "cancel" cancels PAYMENT_PENDING/CONFIRMED rows
    // via cancelViaPatientKeyword, then also lands here.
    CONVERSATION_STATE.START,
  ],
  [CONVERSATION_STATE.PAYMENT_PENDING]: [
    CONVERSATION_STATE.CONFIRMED,
    CONVERSATION_STATE.HUMAN_HANDOFF,
    CONVERSATION_STATE.SLOT_SELECTION, // reminder Reschedule while payment pending (rare)
    // Razorpay "payment.failed" releases the slot hold and resets the
    // contact back to START so they can restart booking — see
    // PaymentWebhookService. Contact-initiated "restart" leaves the
    // dangling Razorpay hold to expire; "cancel" cancels the appointment.
    CONVERSATION_STATE.START,
  ],
  [CONVERSATION_STATE.CONFIRMED]: [
    CONVERSATION_STATE.HUMAN_HANDOFF,
    CONVERSATION_STATE.SLOT_SELECTION, // reminder Reschedule self-serve
    // "menu"/restart clear conversation_state only; "cancel" cancels the
    // appointment then resets conversation_state.
    CONVERSATION_STATE.START,
  ],
  [CONVERSATION_STATE.HUMAN_HANDOFF]: [
    CONVERSATION_STATE.START,
    CONVERSATION_STATE.SLOT_SELECTION, // reminder Reschedule after handoff
  ],
});

/** Hours of inactivity after which a conversation_state row is treated as expired and reset to START. */
export const CONVERSATION_EXPIRY_HOURS = 24;

/** Number of unrecognized replies tolerated before falling back to HUMAN_HANDOFF. */
export const START_MENU_RETRY_LIMIT = 1;

// ─────────────────────────────────────────────────────────────
// START-STATE INTENT MENU
// ─────────────────────────────────────────────────────────────

/** Interactive list-row IDs sent in the START greeting menu. */
export const START_MENU_INTENT = Object.freeze({
  BOOK:            "booking_intent_book",
  RESCHEDULE:      "booking_intent_reschedule",
  CANCEL:          "booking_intent_cancel",
  TALK_TO_CLINIC:  "booking_intent_talk_to_clinic",
});

export const START_MENU_ROWS = Object.freeze([
  { id: START_MENU_INTENT.BOOK,           title: "Book an appointment",    description: "Schedule a new visit" },
  { id: START_MENU_INTENT.RESCHEDULE,     title: "Reschedule",             description: "Change an existing appointment" },
  { id: START_MENU_INTENT.CANCEL,         title: "Cancel appointment",     description: "Cancel an existing appointment" },
  { id: START_MENU_INTENT.TALK_TO_CLINIC, title: "Talk to clinic staff",   description: "Connect with a human" },
]);

export const START_MENU_COPY = Object.freeze({
  GREETING:
    "Hi! 👋 Welcome to {clinicName}. How can we help you today?",
  BUTTON_LABEL: "Choose an option",
  REPROMPT:
    "Sorry, I didn't quite get that. Please choose one of the options below.",
  HUMAN_HANDOFF:
    "I'll connect you with our clinic staff — they'll be with you shortly.",
  UNSUPPORTED_INTENT:
    "That feature is coming soon. Please call the clinic directly for now, or choose \"Talk to clinic staff\".",
});

// ─────────────────────────────────────────────────────────────
// COLLECTING_PATIENT SUB-STATE MACHINE
// (tracked in conversation_state.context.collectingPatientStep — the
//  top-level current_state column stays "COLLECTING_PATIENT" throughout)
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const COLLECTING_PATIENT_STEP = Object.freeze({
  AWAITING_SELECTION:              "AWAITING_SELECTION",
  AWAITING_NAME:                   "AWAITING_NAME",
  AWAITING_DUPLICATE_CONFIRMATION: "AWAITING_DUPLICATE_CONFIRMATION",
  AWAITING_AGE_OR_DOB:             "AWAITING_AGE_OR_DOB",
  AWAITING_CONSENT:                "AWAITING_CONSENT",
});

/** Row id sent for the "Add new patient" option in the patient-selection list. */
export const PATIENT_SELECTION_ADD_NEW_ID = "booking_patient_add_new";

/** Prefix for existing-patient row ids in the patient-selection list — `${PREFIX}${patient.id}`. */
export const PATIENT_SELECTION_ROW_ID_PREFIX = "booking_patient:";

export const CONSENT_INTENT = Object.freeze({
  YES: "booking_consent_yes",
  NO:  "booking_consent_no",
});

export const DUPLICATE_MATCH_INTENT = Object.freeze({
  YES: "booking_duplicate_match_yes",
  NO:  "booking_duplicate_match_no",
});

/**
 * Minimum name similarity (Levenshtein-based, see lib/fuzzy-match.js) to
 * treat a newly entered name as a likely duplicate of an existing patient
 * under the same contact number, prompting a confirmation instead of
 * silently creating a second record. Configurable per the spec's request
 * ("threshold configurable").
 */
export const PATIENT_NAME_FUZZY_MATCH_THRESHOLD = 0.82;

export const COLLECTING_PATIENT_COPY = Object.freeze({
  LIST_BODY: "Who is this appointment for?",
  LIST_BUTTON_LABEL: "Choose patient",
  ADD_NEW_PATIENT_TITLE: "+ Add new patient",
  ASK_NAME: "Sure — what's the patient's full name?",
  ASK_NAME_INVALID_PREFIX: "{error} Please try again.",
  ASK_AGE_OR_DOB: "Thanks! What's {name}'s age (in years) or date of birth (DD-MM-YYYY)?",
  ASK_AGE_OR_DOB_INVALID_PREFIX: "{error}",
  DUPLICATE_MATCH_PROMPT:
    "We found an existing patient named \"{matchName}\" under this number. Is this the same person?",
  DUPLICATE_MATCH_YES_LABEL: "Yes, same person",
  DUPLICATE_MATCH_NO_LABEL: "No, different person",
  ASK_CONSENT:
    "To book via WhatsApp, we need your consent to store {name}'s basic details (name, age, contact) " +
    "for this appointment. Do you consent?",
  CONSENT_YES_LABEL: "Yes, I consent",
  CONSENT_NO_LABEL: "No",
  CONSENT_DECLINED:
    "No problem — we can't proceed with a WhatsApp booking without consent to store the patient's details. " +
    "Send us any message whenever you'd like to start over.",
  SELECTION_REPROMPT: "Sorry, please choose one of the options from the list.",
  DUPLICATE_REPROMPT: "Sorry, please choose one of the two options above.",
  CONSENT_REPROMPT: "Sorry, please choose one of the two options above.",
  CANCEL_ACKNOWLEDGED: "Booking cancelled. Send us any message whenever you'd like to start over.",
});

/**
 * Free-text keywords that globally reset conversation_state back to START
 * (case-insensitive, trimmed). Matched as an exact phrase after normalize —
 * "start over" is one keyword, not two tokens.
 *
 * Extend this list when adding synonyms; keep matching logic in
 * ConversationStateService so every state shares one intercept.
 */
export const RESET_KEYWORDS = Object.freeze([
  "restart",
  "start over",
  "reset",
  "menu",
]);

/**
 * Free-text keywords that cancel an in-progress / confirmed appointment
 * (case-insensitive, trimmed). Distinct from RESET_KEYWORDS — "cancel"
 * updates the appointments row when context.appointmentId is cancellable;
 * otherwise it falls back to the same "let's start over" reset path.
 */
export const CANCEL_KEYWORDS = Object.freeze(["cancel"]);

/**
 * @deprecated Prefer CANCEL_KEYWORDS. Kept for older call sites / docs.
 */
export const CANCEL_KEYWORD = "cancel";

/** Interactive button ids for the PAYMENT_PENDING reset confirmation. */
export const RESET_CONFIRM_INTENT = Object.freeze({
  YES: "booking_reset_confirm_yes",
  NO:  "booking_reset_confirm_no",
});

/** Interactive button ids for the PAYMENT_PENDING appointment-cancel confirmation. */
export const CANCEL_CONFIRM_INTENT = Object.freeze({
  YES: "booking_cancel_confirm_yes",
  NO:  "booking_cancel_confirm_no",
});

/**
 * Copy for the global conversation reset intercept
 * (ConversationStateService — restart / start over / reset / menu).
 */
export const RESET_COPY = Object.freeze({
  /** Body of the START menu re-sent after a successful reset. */
  ACKNOWLEDGED: "No problem, let's start over. How can I help you today?",
  PAYMENT_PENDING_CONFIRM:
    "You have a payment in progress for this booking. Starting over here " +
    "won't cancel that payment link — it may still work until it expires. " +
    "Are you sure you want to start over?",
  PAYMENT_PENDING_YES_LABEL: "Yes, start over",
  PAYMENT_PENDING_NO_LABEL: "No, keep waiting",
  PAYMENT_PENDING_KEEP:
    "Okay — we'll keep this booking open. Complete the payment using the link we sent earlier, " +
    "or reply \"restart\" if you still want to start over.",
  PAYMENT_PENDING_REPROMPT: "Sorry, please choose one of the two options above.",
});

/**
 * Copy for patient-initiated appointment cancellation via WhatsApp "cancel".
 * Placeholders: {slotLabel} from formatSlotLabel(slot_start).
 */
export const CANCEL_COPY = Object.freeze({
  CONFIRMED:
    "Your appointment on {slotLabel} has been cancelled. How can I help you today?",
  WITHOUT_SLOT:
    "Your appointment has been cancelled. How can I help you today?",
  PAYMENT_PENDING_CONFIRM:
    "You have a payment in progress for this booking. Cancelling will free the slot " +
    "(the payment link may still appear to work until it expires). " +
    "Do you want to cancel this appointment?",
  PAYMENT_PENDING_YES_LABEL: "Yes, cancel",
  PAYMENT_PENDING_NO_LABEL: "No, keep it",
  PAYMENT_PENDING_KEEP:
    "Okay — we'll keep this booking open. Complete the payment using the link we sent earlier, " +
    "or reply \"cancel\" if you still want to cancel.",
  PAYMENT_PENDING_REPROMPT: "Sorry, please choose one of the two options above.",
  MENU_AFTER_CANCEL: "How can I help you today?",
});

/** appointments.cancellation_reason for patient WhatsApp "cancel" keyword. */
export const PATIENT_REQUESTED_CANCELLATION_REASON = "patient_requested";

/**
 * Plain-text fallback when a contact messages while already booked
 * (conversation_state CONFIRMED). Free-form session message — not a Meta
 * template. Placeholders: {date}, {time} from the appointment's slot_start.
 *
 * "cancel" cancels the appointment (ConversationStateService cancel path);
 * "menu" is a RESET_KEYWORDS conversation reset.
 */
export const CONFIRMED_INBOUND_COPY = Object.freeze({
  WITH_SLOT:
    "Your appointment on {date} at {time} is confirmed. " +
    "Reply 'cancel' to cancel or 'menu' to see options.",
  WITHOUT_SLOT:
    "Your appointment is confirmed. " +
    "Reply 'cancel' to cancel or 'menu' to see options.",
});

/**
 * States that share the post-booking inbound fallback reply.
 * `REMINDER_SENT` is deliberately NOT a conversation_state FSM value
 * (reminders live on appointments.reminder_*_sent_at — see REMINDER_SENT
 * section below); it is listed only so a stray/legacy current_state string
 * gets the same patient-facing reply as CONFIRMED.
 */
export const CONFIRMED_INBOUND_FALLBACK_STATES = Object.freeze([
  CONVERSATION_STATE.CONFIRMED,
  "REMINDER_SENT",
]);

/**
 * Copy shared across multiple state handlers (not scoped to one
 * conversation state).
 */
export const SHARED_BOOKING_COPY = Object.freeze({
  /** A stray tap on an old "Book" menu option while already mid-flow — see the
   * COLLECTING_PATIENT / SLOT_SELECTION module docs for the edge-case rationale. */
  CONCURRENT_BOOKING_REJECTED:
    "You're already in the middle of booking an appointment{forName}. " +
    "Please finish this booking first, or reply \"restart\" to start over.",
});

// ─────────────────────────────────────────────────────────────
// SLOT_SELECTION STATE
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const SLOT_SELECTION_STEP = Object.freeze({
  AWAITING_SELECTION:             "AWAITING_SELECTION",
  AWAITING_OVERLAP_CONFIRMATION:  "AWAITING_OVERLAP_CONFIRMATION",
});

/** Prefix for slot row ids in the slot-selection list — `${PREFIX}${slotStart.toISOString()}`. */
export const SLOT_ROW_ID_PREFIX = "booking_slot:";

/** List-row id for advancing to the next page of open slots. */
export const SLOT_LIST_MORE_ROW_ID = "booking_slot_more";

export const OVERLAP_CONFIRM_INTENT = Object.freeze({
  YES: "booking_overlap_confirm_yes",
  NO:  "booking_overlap_confirm_no",
});

/**
 * No per-clinic timezone config exists yet (ARCHITECTURE.md open decision
 * #1) — every clinic is assumed to operate on India Standard Time, a fixed
 * (no-DST) UTC+05:30 offset. Slot generation deliberately avoids relying on
 * the server process's local timezone so this is correct regardless of
 * where the app is deployed.
 */
export const SLOT_TIMEZONE_OFFSET = "+05:30";

/** How many calendar days ahead (inclusive of today) to search for open slots. */
export const SLOT_SEARCH_DAYS_AHEAD = 7;

/** A slot must start at least this many minutes from now to be offered (no last-second bookings). */
export const SLOT_MIN_LEAD_MINUTES = 60;

/** Fallback consultation length when doctor_profiles.consultation_duration is null. */
export const SLOT_DEFAULT_CONSULTATION_DURATION_MINUTES = 30;

/**
 * How long a PAYMENT_PENDING slot hold reserves the slot before it's
 * treated as expired (and the slot becomes bookable again). Stamped onto
 * `appointments.hold_expires_at` at booking time; see
 * AppointmentRepository's header comment for how expiry is enforced
 * without a background job.
 */
export const SLOT_HOLD_DURATION_MINUTES = 10;

/** Fallback working hours when doctor_profiles.working_hours_start/end are null or malformed. */
export const SLOT_DEFAULT_WORKING_HOURS_START = "09:00";
export const SLOT_DEFAULT_WORKING_HOURS_END = "18:00";

/**
 * Max number of *slot* rows shown per list message when more slots remain.
 * Meta caps interactive "list" messages at WHATSAPP_CONFIG.MAX_LIST_ROWS
 * rows **total across all sections** (Morning/Afternoon/Evening sections
 * do not raise capacity), so one row is reserved for "More times →"
 * whenever the remaining open-slot count exceeds MAX_LIST_ROWS.
 */
export const SLOT_LIST_MAX_OPTIONS = 9;

export const SLOT_SELECTION_COPY = Object.freeze({
  LIST_BODY: "Please choose a slot for your appointment:",
  LIST_BUTTON_LABEL: "Choose a time",
  MORE_TIMES_TITLE: "More times →",
  SELECTION_REPROMPT: "Sorry, please choose one of the times from the list.",
  SLOT_TAKEN_REPROMPT: "Sorry, that slot was just taken by someone else. Here are the current options:",
  OVERLAP_WARNING:
    "Heads up — {patientName} already has a confirmed appointment on {existingSlot}. " +
    "Book this one anyway?",
  OVERLAP_YES_LABEL: "Yes, book anyway",
  OVERLAP_NO_LABEL: "No, let me pick again",
  OVERLAP_REPROMPT: "Sorry, please choose one of the two options above.",
  NO_DOCTOR_HANDOFF:
    "We're having trouble finding an available slot right now — connecting you with our clinic staff to help directly.",
  NO_SLOTS_HANDOFF:
    "We don't have any open slots in the next few days — connecting you with our clinic staff to help directly.",
  GENERIC_HANDOFF:
    "Something went wrong on our end — connecting you with our clinic staff to help directly.",
  /**
   * {paymentLink} is a real, payable Razorpay Payment Link (Session 4 —
   * see RazorpayClientService). {amount} is the doctor's real
   * consultation_fee (see lib/consultation-fee.js), not a placeholder.
   */
  PAYMENT_PENDING_MESSAGE:
    "Your slot on {slotLabel} is reserved for {patientName}. " +
    "To confirm, please complete payment of ₹{amount}: {paymentLink}\n" +
    "This reservation expires in {holdMinutes} minutes if payment isn't completed.",
  CONFIRMED:
    "You're confirmed! {patientName} is booked with {clinicName} on {slotLabel}. See you then!",
});

/**
 * Copy sent by PaymentWebhookService directly (not a state-handler reply to
 * an inbound WhatsApp message — these fire asynchronously off a Razorpay
 * webhook).
 *
 * PAYMENT_CONFIRMED is the plain-text fallback when WHATSAPP_TEMPLATES_LIVE
 * is false; when live, _handleCaptured sends BOOKING_CONFIRMED_TEMPLATE_NAME
 * instead. Keep this copy free of any button / formatting meta-commentary —
 * it is patient-facing.
 */
export const PAYMENT_WEBHOOK_COPY = Object.freeze({
  PAYMENT_CONFIRMED:
    "Payment received! Your appointment on {slotLabel} is confirmed. " +
    "Please arrive 10 minutes early. See you then!",
  PAYMENT_FAILED:
    "Your payment couldn't be completed, so this slot has been released. " +
    "Send us any message whenever you'd like to try booking again.",
});

/**
 * Approved Meta WhatsApp template sent by PaymentWebhookService._handleCaptured
 * on "payment.captured" (replaces the PAYMENT_WEBHOOK_COPY.PAYMENT_CONFIRMED
 * free-text send when WHATSAPP_TEMPLATES_LIVE=true).
 *
 * Canonical patient-facing body (static text + {{n}} placeholders only —
 * NO button notes, developer commentary, or "Buttons:" lines belong here;
 * those must live in Meta's button UI / our code comments, never in the
 * template body patients see):
 *
 *   "Hi {{1}}, your appointment with {{2}} is confirmed for {{3}}.
 *    Consultation fee: ₹{{4}}. Clinic: {{5}}. Please arrive 10 minutes early."
 *
 * Params in order: patient full_name, doctor full_name, formatted slot
 * label, payment_amount, clinic name. No quick-reply button components —
 * confirmation is informational only.
 *
 * If patients see leaked text like "Buttons: None…", edit the template
 * body in Meta WhatsApp Manager for `appt_booking_confirmed` — our code
 * only supplies the five {{n}} values and never appends button commentary.
 */
export const BOOKING_CONFIRMED_TEMPLATE_NAME = "appt_booking_confirmed";

/**
 * Exact static body the Meta template `appt_booking_confirmed` must use
 * (for docs + regression tests). Placeholders {{1}}…{{5}} are filled by
 * PaymentWebhookService bodyParams — not by an LLM.
 */
export const BOOKING_CONFIRMED_TEMPLATE_BODY =
  "Hi {{1}}, your appointment with {{2}} is confirmed for {{3}}. " +
  "Consultation fee: ₹{{4}}. Clinic: {{5}}. Please arrive 10 minutes early.";

/** Meta template language code for BOOKING_CONFIRMED_TEMPLATE_NAME. */
export const BOOKING_CONFIRMED_TEMPLATE_LANGUAGE_CODE = "en";

/**
 * Meta WhatsApp UTILITY template for consultation invoices.
 *
 * Exact approved body from Meta Graph API (WABA `message_templates`,
 * 2026-07-23) — do not reorder {{n}} without re-checking Business Manager:
 *
 *   "Your invoice for the appointment on {{1}} is attached."
 *
 * {{1}} = appointment date/time (formatSlotLabel). No HEADER / BUTTONS on
 * the approved template — PDF is sent as a follow-up free-form document
 * (see sendInvoiceDocument). Language: en. Status: APPROVED.
 */
export const INVOICE_WHATSAPP_TEMPLATE_NAME = "appt_invoice";

/**
 * Exact static body the Meta template `appt_invoice` must use
 * (docs + regression tests). Placeholder {{1}} is filled by InvoiceService.
 */
export const INVOICE_WHATSAPP_TEMPLATE_BODY =
  "Your invoice for the appointment on {{1}} is attached.";

/** Meta template language code for INVOICE_WHATSAPP_TEMPLATE_NAME. */
export const INVOICE_WHATSAPP_TEMPLATE_LANGUAGE_CODE = "en";

/**
 * Private Supabase Storage bucket + path helpers for invoice PDFs
 * (migration 024). Objects are never public; WhatsApp fetches via
 * short-lived signed URLs from InvoiceStorageService.
 */
export const INVOICE_STORAGE = Object.freeze({
  BUCKET: "booking-invoices",
  /** Signed download TTL — long enough for Meta to fetch the document header. */
  SIGNED_URL_TTL_SECONDS: 60 * 60,
  /**
   * @param {string} clinicId
   * @param {string} appointmentId
   * @returns {string}
   */
  buildPath: (clinicId, appointmentId) =>
    `invoices/${clinicId}/${appointmentId}.pdf`,
});

// ─────────────────────────────────────────────────────────────
// HUMAN_HANDOFF DOCTOR NOTIFICATION
// ─────────────────────────────────────────────────────────────

/** @enum {string} Why a conversation fell back to HUMAN_HANDOFF — drives the doctor-facing alert's reason line. */
export const HANDOFF_REASON = Object.freeze({
  UNRECOGNIZED_MENU_REPLY:     "unrecognized_menu_reply",
  NO_DOCTOR_CONFIGURED:        "no_doctor_configured",
  NO_SLOTS_AVAILABLE:          "no_slots_available",
  MISSING_BOOKING_CONTEXT:     "missing_booking_context",
  MISSING_CONSULTATION_FEE:    "missing_consultation_fee",
  /** Session 5: patient tapped "Reschedule" on a reminder — see REMINDER_COPY / ReminderService. */
  RESCHEDULE_REQUESTED_VIA_REMINDER: "reschedule_requested_via_reminder",
});

/**
 * Sent to every doctor_profiles.phone on the clinic when a conversation
 * falls back to HUMAN_HANDOFF. Uses the same free-form Meta send as the
 * greeting message — see index.js header note on the 24h session-window
 * caveat this implies.
 */
export const HANDOFF_NOTIFICATION_COPY = Object.freeze({
  DOCTOR_ALERT:
    "⚠️ Booking bot handoff needed\n" +
    "Contact: {contactDisplay}\n" +
    "Last message: {lastMessage}\n" +
    "Reason: {reasonLine}\n" +
    "Please follow up with this patient directly.",
  REASON_LINE: Object.freeze({
    [HANDOFF_REASON.UNRECOGNIZED_MENU_REPLY]: "The bot couldn't understand their reply.",
    [HANDOFF_REASON.NO_DOCTOR_CONFIGURED]: "No doctor is configured for this clinic yet.",
    [HANDOFF_REASON.NO_SLOTS_AVAILABLE]: "No open slots in the doctor's configured availability window.",
    [HANDOFF_REASON.MISSING_BOOKING_CONTEXT]: "The bot lost track of which patient this booking was for (internal error).",
    [HANDOFF_REASON.MISSING_CONSULTATION_FEE]: "This doctor hasn't configured a consultation fee yet — booking can't proceed until they do (dashboard setup needed).",
    [HANDOFF_REASON.RESCHEDULE_REQUESTED_VIA_REMINDER]: "Patient requested a reschedule via an appointment reminder — self-serve rescheduling isn't built yet, please help them find a new time.",
  }),
});

// ─────────────────────────────────────────────────────────────
// APPOINTMENT STATUS
// (public.appointments.status — populated from SLOT_SELECTION onward)
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const APPOINTMENT_STATUS = Object.freeze({
  PENDING:              "pending",
  PAYMENT_PENDING:      "payment_pending",
  CONFIRMED:            "confirmed",
  CANCELLED:            "cancelled",
  RESCHEDULED:          "rescheduled",
  /**
   * Session 5 addition: set when a patient taps "Reschedule" on a reminder
   * message. A marker for manual doctor/staff follow-up only — the
   * self-serve loop-back into SLOT_SELECTION with pre-filled patient
   * context is explicitly Session 6 scope (ARCHITECTURE.md / booking
   * prompts doc), not built yet. `appointments.status` has no DB-level
   * CHECK constraint (confirmed live), so this is safe to introduce
   * app-side without a migration.
   */
  RESCHEDULE_REQUESTED: "reschedule_requested",
  NO_SHOW:              "no_show",
  COMPLETED:            "completed",
});

/**
 * There is no dedicated "payment required" flag on `clinics` or
 * `doctor_profiles` — flagged rather than silently added per the booking
 * prompts doc's rule ("if output diverges from ARCHITECTURE.md's FK
 * structure, stop and flag — do not let it silently create new
 * columns/tables"). The user was asked which source of truth to use for
 * this and did not pick one, so SLOT_SELECTION uses this documented
 * fallback: `doctor_profiles.consultation_fee > PAYMENT_REQUIRED_MIN_FEE`
 * means prepayment is required (an explicit fee of exactly 0 means the
 * doctor has deliberately configured a free consultation). A *missing*
 * (null/undefined) fee is a distinct, stricter case — see
 * lib/consultation-fee.js — that fails loudly instead of either of the
 * above. Revisit if a dedicated flag is added later.
 */
export const PAYMENT_REQUIRED_MIN_FEE = 0;

// ─────────────────────────────────────────────────────────────
// RAZORPAY WEBHOOK
// ─────────────────────────────────────────────────────────────

/** @enum {string} Razorpay webhook `event` field values PaymentWebhookService understands; anything else is logged and ignored. */
export const RAZORPAY_EVENT_TYPE = Object.freeze({
  PAYMENT_CAPTURED: "payment.captured",
  PAYMENT_FAILED:   "payment.failed",
});

// ─────────────────────────────────────────────────────────────
// REMINDER_SENT (Session 5 — scheduled job, not user-triggered)
//
// Deliberately NOT a conversation_state.current_state value — see
// ARCHITECTURE.md section 4 and index.js header notes. Progress lives on
// `appointments.reminder_24h_sent_at` / `reminder_2h_sent_at` instead, and
// quick-reply routing (Confirm/Cancel/Reschedule) self-identifies its
// target appointment via the button id (see lib/reminder-reply.js) rather
// than depending on conversation_state at all.
// ─────────────────────────────────────────────────────────────

/** @enum {string} Which reminder threshold a query/claim/send call is operating on. */
export const REMINDER_KIND = Object.freeze({
  H24: "24h",
  H2:  "2h",
});

/** Maps REMINDER_KIND -> the appointments column that guards/records that reminder having been sent. */
export const REMINDER_SENT_AT_COLUMN = Object.freeze({
  [REMINDER_KIND.H24]: "reminder_24h_sent_at",
  [REMINDER_KIND.H2]:  "reminder_2h_sent_at",
});

/** Maps REMINDER_KIND -> the clinics column configuring how many minutes before slot_start it fires. */
export const REMINDER_OFFSET_COLUMN = Object.freeze({
  [REMINDER_KIND.H24]: "reminder_24h_offset_minutes",
  [REMINDER_KIND.H2]:  "reminder_2h_offset_minutes",
});

/** Fallback offsets when a clinic row predates migration 021 or the column is somehow null. */
export const REMINDER_DEFAULT_OFFSET_MINUTES = Object.freeze({
  [REMINDER_KIND.H24]: 1440,
  [REMINDER_KIND.H2]:  120,
});

/**
 * How wide a window (minutes) each cron run scans around "now + offset" for
 * candidate appointments. Must comfortably exceed the cron's own interval
 * (recommended 15 min — see vercel.json) so a slightly-late run never skips
 * an appointment; a window that overlaps a previous run is harmless since
 * `reminder_Xh_sent_at IS NULL` (checked at query time) plus the atomic
 * claim-before-send UPDATE (see AppointmentRepository.claimReminder) make
 * re-scanning the same window idempotent.
 */
export const REMINDER_WINDOW_MINUTES = 20;

/**
 * Grace period after `slot_end` before a CONFIRMED appointment with no
 * reminder reply is auto-completed by the booking-reminders cron
 * (`completeExpiredConfirmed`). Keeps the Scribe "Start consultation"
 * window open for late-running consultations.
 */
export const CONFIRMED_AUTO_COMPLETE_GRACE_MINUTES = 60;

/**
 * Placeholder WhatsApp template names (Session 5 spec) — the real templates
 * are still pending Meta review. Matches the existing UTILITY-category
 * naming convention (`appt_booking_confirmed`, etc. — see doc comments
 * elsewhere referencing that convention). Do not send real template calls
 * until WHATSAPP_TEMPLATES_LIVE=true AND these names are confirmed approved
 * in the Meta dashboard — see ReminderService.
 */
export const REMINDER_TEMPLATE_NAME = Object.freeze({
  [REMINDER_KIND.H24]: "appt_reminder_24h",
  [REMINDER_KIND.H2]:  "appt_reminder_2h",
});

/** Meta template language code used for both reminder templates. */
export const REMINDER_TEMPLATE_LANGUAGE_CODE = "en";

/**
 * Quick-reply button id action tags, embedded as `booking_reminder_{action}:{appointmentId}`
 * (see lib/reminder-reply.js). ASSUMPTION flagged for verification once the
 * real templates are approved: quick_reply buttons are defined by index at
 * template-creation time in Meta Business Manager, and this order
 * (Confirm=0, Cancel=1, Reschedule=2) is what ReminderService.sendTemplate
 * assumes when stamping each button's payload — must be checked against
 * the actual approved template layout before flipping WHATSAPP_TEMPLATES_LIVE.
 */
export const REMINDER_REPLY_ACTION = Object.freeze({
  CONFIRM:    "confirm",
  CANCEL:     "cancel",
  RESCHEDULE: "reschedule",
});

/** Prefix for reminder quick-reply button ids — `${PREFIX}${action}:${appointmentId}`. */
export const REMINDER_REPLY_ID_PREFIX = "booking_reminder_";

export const REMINDER_COPY = Object.freeze({
  /**
   * {variables} sent to the template call when WHATSAPP_TEMPLATES_LIVE is
   * true; this exact text is also what's logged as the "would send" stub
   * body when it's false, so the pipeline is visibly testable end-to-end
   * before templates are approved.
   */
  H24_BODY: "Reminder: {patientName} has an appointment with {clinicName} tomorrow, {slotLabel}. Please confirm, cancel, or reschedule.",
  H2_BODY:  "Reminder: {patientName}'s appointment with {clinicName} is in about 2 hours, {slotLabel}. Please confirm, cancel, or reschedule.",
  CONFIRM_BUTTON_LABEL:    "Confirm",
  CANCEL_BUTTON_LABEL:     "Cancel",
  RESCHEDULE_BUTTON_LABEL: "Reschedule",
  CONFIRM_ACK: "Great, see you then!",
  CANCEL_ACK: "Your appointment on {slotLabel} has been cancelled. Send us any message whenever you'd like to book again.",
  /** Shown before the slot list when patient taps Reschedule on a reminder. */
  RESCHEDULE_PICK_SLOT:
    "Sure — please pick a new time from the list below. Your current booking stays held until you choose.",
  /** After a successful self-serve reschedule onto a new slot. */
  RESCHEDULE_CONFIRMED: "Done — your appointment is now on {slotLabel}.",
  /**
   * @deprecated Prefer RESCHEDULE_PICK_SLOT / RESCHEDULE_CONFIRMED (self-serve).
   * Kept for older tests that still assert the manual-handoff copy.
   */
  RESCHEDULE_ACK:
    "Got it — we've flagged this for our clinic staff to help you find a new time. They'll be in touch shortly.",
  /** Reply doesn't match a known reminder action, or references an appointment no longer in a reminder-able state. */
  STALE_OR_UNKNOWN_REPLY:
    "Sorry, this appointment reminder is no longer active. Send us any message if you need help.",
});

// ─────────────────────────────────────────────────────────────
// WHATSAPP MESSAGE TYPES (normalized, post-parsing)
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const INBOUND_MESSAGE_TYPE = Object.freeze({
  TEXT:         "text",
  BUTTON_REPLY: "button_reply",
  LIST_REPLY:   "list_reply",
  UNKNOWN:      "unknown",
});

export const WHATSAPP_CONFIG = Object.freeze({
  DEFAULT_API_VERSION: "v21.0",
  GRAPH_BASE_URL: "https://graph.facebook.com",
  /** Meta's hard limit on quick-reply buttons per interactive "button" message. */
  MAX_REPLY_BUTTONS: 3,
  /** Meta's hard limit on rows per interactive "list" message. */
  MAX_LIST_ROWS: 10,
});
