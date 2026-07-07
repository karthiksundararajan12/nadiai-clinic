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
  ],
  [CONVERSATION_STATE.PAYMENT_PENDING]: [
    CONVERSATION_STATE.CONFIRMED,
    CONVERSATION_STATE.HUMAN_HANDOFF,
    // Razorpay "payment.failed" releases the slot hold and resets the
    // contact back to START so they can restart booking — see
    // PaymentWebhookService.
    CONVERSATION_STATE.START,
  ],
  [CONVERSATION_STATE.CONFIRMED]: [
    CONVERSATION_STATE.HUMAN_HANDOFF,
  ],
  [CONVERSATION_STATE.HUMAN_HANDOFF]: [
    CONVERSATION_STATE.START,
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

/** Free-text keyword that resets the conversation back to START from any state. */
export const CANCEL_KEYWORD = "cancel";

/**
 * Copy shared across multiple state handlers (not scoped to one
 * conversation state).
 */
export const SHARED_BOOKING_COPY = Object.freeze({
  /** A stray tap on an old "Book" menu option while already mid-flow — see the
   * COLLECTING_PATIENT / SLOT_SELECTION module docs for the edge-case rationale. */
  CONCURRENT_BOOKING_REJECTED:
    "You're already in the middle of booking an appointment{forName}. " +
    "Please finish this booking first, or reply \"cancel\" to start over.",
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
 * Max number of open slots shown per list message. Meta caps interactive
 * "list" messages at WHATSAPP_CONFIG.MAX_LIST_ROWS total rows; slots use
 * every row (no "show more" row) — v1 keeps it simple and just shows the
 * earliest N slots, no pagination.
 */
export const SLOT_LIST_MAX_OPTIONS = 9;

export const SLOT_SELECTION_COPY = Object.freeze({
  LIST_BODY: "Please choose a slot for your appointment:",
  LIST_BUTTON_LABEL: "Choose a time",
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
 * webhook, so they intentionally don't need {patientName}/{clinicName}
 * lookups the way SLOT_SELECTION_COPY.CONFIRMED does).
 */
export const PAYMENT_WEBHOOK_COPY = Object.freeze({
  PAYMENT_CONFIRMED: "Payment received! Your appointment on {slotLabel} is confirmed. See you then!",
  PAYMENT_FAILED:
    "Your payment couldn't be completed, so this slot has been released. " +
    "Send us any message whenever you'd like to try booking again.",
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
  }),
});

// ─────────────────────────────────────────────────────────────
// APPOINTMENT STATUS
// (public.appointments.status — populated from SLOT_SELECTION onward)
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const APPOINTMENT_STATUS = Object.freeze({
  PENDING:         "pending",
  PAYMENT_PENDING: "payment_pending",
  CONFIRMED:       "confirmed",
  CANCELLED:       "cancelled",
  RESCHEDULED:     "rescheduled",
  NO_SHOW:         "no_show",
  COMPLETED:       "completed",
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
