/**
 * @fileoverview ConversationStateService — the WhatsApp booking bot's
 * top-level conversation state machine.
 *
 * Owns the START state directly, and dispatches to per-state services for
 * everything after it (COLLECTING_PATIENT -> PatientCollectionService,
 * SLOT_SELECTION -> SlotSelectionService). Also owns cross-cutting concerns
 * shared by every state:
 *   - Fresh/expired conversation detection (> 24h inactivity resets to START).
 *   - Idempotency on wa_message_id (Meta may redeliver the same webhook).
 *   - Global reset keywords (RESET_KEYWORDS — "restart", "cancel", …) which
 *     short-circuit normal state routing and reset conversation_state to
 *     START. PAYMENT_PENDING gets an explicit confirmation step first so we
 *     don't silently abandon a mid-flight Razorpay hold from chat alone
 *     (the hold is left to expire; we never cancel/refund appointments here).
 *
 * Doctor HUMAN_HANDOFF notifications are shared across every state via
 * DoctorNotificationService (see that file) rather than owned here, since
 * SLOT_SELECTION can also trigger a handoff (no doctor configured / no open
 * slots).
 *
 * START behavior:
 *   - Sends the greeting + intent menu (Book / Reschedule / Cancel /
 *     Talk to clinic) as a WhatsApp interactive LIST message (4 options
 *     exceed Meta's 3-button cap on the "button" interactive type).
 *   - Unrecognized replies get one re-prompt, then HUMAN_HANDOFF (+ a
 *     WhatsApp alert to the clinic's doctor(s)).
 *   - "Book" transitions to COLLECTING_PATIENT, handing off immediately to
 *     PatientCollectionService.enterState to render the first screen.
 *
 * Every method is scoped by `clinic.id`, resolved once by the webhook
 * route via ClinicRepository.findByWhatsAppPhoneNumberId — never by
 * patient_id, since a patient record frequently doesn't exist yet.
 */

import {
  CONVERSATION_STATE,
  START_MENU_INTENT,
  START_MENU_ROWS,
  START_MENU_COPY,
  START_MENU_RETRY_LIMIT,
  HANDOFF_REASON,
  RESET_KEYWORDS,
  RESET_CONFIRM_INTENT,
  RESET_COPY,
} from "../constants.js";
import { assertValidConversationTransition } from "../lib/conversation-transitions.js";
import { isConversationExpired } from "../lib/conversation-expiry.js";
import { createLogger } from "../logger.js";

export class ConversationStateService {
  /**
   * @param {import("../repository/conversation-state.repository.js").ConversationStateRepository} conversationRepo
   * @param {import("./whatsapp-client.service.js").WhatsAppClientService} whatsappClient
   * @param {import("./doctor-notification.service.js").DoctorNotificationService} doctorNotificationService
   * @param {import("./patient-collection.service.js").PatientCollectionService} patientCollectionService
   * @param {import("./slot-selection.service.js").SlotSelectionService} slotSelectionService
   */
  constructor(conversationRepo, whatsappClient, doctorNotificationService, patientCollectionService, slotSelectionService) {
    this._repo         = conversationRepo;
    this._wa           = whatsappClient;
    this._doctorNotifier = doctorNotificationService;
    this._patientSvc   = patientCollectionService;
    this._slotSvc      = slotSelectionService;
    this._log          = createLogger({ component: "ConversationStateService" });
  }

  /**
   * Entry point for every normalized inbound WhatsApp message.
   * Resolves whether this is a new/expired conversation (→ START) or an
   * in-flight one, applies cross-cutting idempotency/cancel handling, and
   * dispatches by current_state.
   *
   * @param {{ clinic: import("../repository/clinic.repository.js").BookingClinic; message: import("../lib/webhook-parser.js").NormalizedInboundMessage }} input
   */
  async processInboundMessage({ clinic, message }) {
    const log = this._log.child({ clinicId: clinic.id, waMessageId: message.waMessageId });
    const existing = await this._repo.find(clinic.id, message.contactPhone);
    const isFreshOrExpired = !existing || isConversationExpired(existing.last_message_at);

    if (isFreshOrExpired) {
      return this._resetToStartAndGreet({ clinic, message, wasExpired: Boolean(existing), log });
    }

    const row = existing;

    // Idempotency: Meta may redeliver the same webhook — never re-trigger side
    // effects, regardless of which state the conversation is currently in.
    if (row.context?.last_wa_message_id === message.waMessageId) {
      log.info("Duplicate wa_message_id — skipping re-processing", { contactPhone: message.contactPhone });
      return { handled: true, action: "DUPLICATE_SKIPPED", currentState: row.current_state };
    }

    // Global reset intercept — before any per-state routing. Also covers the
    // PAYMENT_PENDING confirmation follow-up (yes/no buttons).
    if (row.context?.awaitingResetConfirmation) {
      return this._handleResetConfirmationReply({ clinic, message, row, log });
    }
    if (this._isResetKeyword(message)) {
      return this._handleResetKeyword({ clinic, message, row, log });
    }

    if (row.current_state === CONVERSATION_STATE.START) {
      return this._handleStart({ clinic, message, row, log });
    }

    if (row.current_state === CONVERSATION_STATE.COLLECTING_PATIENT) {
      return this._patientSvc.handleReply({ clinic, message, row, log });
    }

    if (row.current_state === CONVERSATION_STATE.SLOT_SELECTION) {
      return this._slotSvc.handleReply({ clinic, message, row, log });
    }

    log.info("Inbound message for a state with no handler yet — no-op", {
      currentState: row.current_state,
    });
    return {
      handled: false,
      reason: "NO_HANDLER_FOR_STATE",
      currentState: row.current_state,
    };
  }

  /**
   * Exact phrase match against RESET_KEYWORDS after trim + lower-case.
   * @param {import("../lib/webhook-parser.js").NormalizedInboundMessage} message
   */
  _isResetKeyword(message) {
    if (message.type !== "text") return false;
    const normalized = String(message.text ?? "").trim().toLowerCase();
    return RESET_KEYWORDS.includes(normalized);
  }

  async _handleResetKeyword({ clinic, message, row, log }) {
    // Mid-payment: confirm before wiping conversation_state so the contact
    // knows a Razorpay link may still be live. We still do NOT cancel the
    // appointment or refund — the hold expires on its own.
    if (row.current_state === CONVERSATION_STATE.PAYMENT_PENDING) {
      return this._promptPaymentPendingResetConfirmation({ clinic, message, row, log });
    }
    return this._resetConversationToStart({ clinic, message, row, log });
  }

  async _promptPaymentPendingResetConfirmation({ clinic, message, row, log }) {
    await this._wa.sendInteractiveButtons(clinic.whatsapp_phone_number_id, message.contactPhone, {
      bodyText: RESET_COPY.PAYMENT_PENDING_CONFIRM,
      buttons: [
        { id: RESET_CONFIRM_INTENT.YES, title: RESET_COPY.PAYMENT_PENDING_YES_LABEL },
        { id: RESET_CONFIRM_INTENT.NO, title: RESET_COPY.PAYMENT_PENDING_NO_LABEL },
      ],
    });
    await this._repo.update(row.id, {
      context: {
        ...row.context,
        last_wa_message_id: message.waMessageId,
        awaitingResetConfirmation: true,
      },
      last_message_at: new Date().toISOString(),
    });
    log.info("Prompted for PAYMENT_PENDING reset confirmation", { contactPhone: message.contactPhone });
    return {
      handled: true,
      action: "RESET_CONFIRMATION_PROMPTED",
      currentState: CONVERSATION_STATE.PAYMENT_PENDING,
    };
  }

  async _handleResetConfirmationReply({ clinic, message, row, log }) {
    const replyId =
      message.type === "button_reply" || message.type === "list_reply" ? message.replyId : null;

    if (replyId === RESET_CONFIRM_INTENT.YES || this._isResetKeyword(message)) {
      return this._resetConversationToStart({ clinic, message, row, log });
    }

    if (replyId === RESET_CONFIRM_INTENT.NO) {
      await this._wa.sendText(
        clinic.whatsapp_phone_number_id,
        message.contactPhone,
        RESET_COPY.PAYMENT_PENDING_KEEP,
      );
      const restContext = { ...(row.context ?? {}) };
      delete restContext.awaitingResetConfirmation;
      await this._repo.update(row.id, {
        context: { ...restContext, last_wa_message_id: message.waMessageId },
        last_message_at: new Date().toISOString(),
      });
      log.info("Contact kept PAYMENT_PENDING booking after reset prompt", {
        contactPhone: message.contactPhone,
      });
      return {
        handled: true,
        action: "RESET_ABORTED",
        currentState: CONVERSATION_STATE.PAYMENT_PENDING,
      };
    }

    await this._wa.sendInteractiveButtons(clinic.whatsapp_phone_number_id, message.contactPhone, {
      bodyText: RESET_COPY.PAYMENT_PENDING_REPROMPT,
      buttons: [
        { id: RESET_CONFIRM_INTENT.YES, title: RESET_COPY.PAYMENT_PENDING_YES_LABEL },
        { id: RESET_CONFIRM_INTENT.NO, title: RESET_COPY.PAYMENT_PENDING_NO_LABEL },
      ],
    });
    await this._repo.update(row.id, {
      context: { ...row.context, last_wa_message_id: message.waMessageId, awaitingResetConfirmation: true },
      last_message_at: new Date().toISOString(),
    });
    return {
      handled: true,
      action: "RESET_CONFIRMATION_REPROMPTED",
      currentState: CONVERSATION_STATE.PAYMENT_PENDING,
    };
  }

  /**
   * Clears conversation_state back to START and re-sends the intent menu.
   * Does not touch appointments / Razorpay — conversation flow only.
   */
  async _resetConversationToStart({ clinic, message, row, log }) {
    if (row.current_state !== CONVERSATION_STATE.START) {
      assertValidConversationTransition(row.current_state, CONVERSATION_STATE.START);
    }

    const updated = await this._repo.update(row.id, {
      current_state: CONVERSATION_STATE.START,
      retry_count: 0,
      context: { last_wa_message_id: message.waMessageId },
      last_message_at: new Date().toISOString(),
    });

    await this._wa.sendInteractiveList(clinic.whatsapp_phone_number_id, message.contactPhone, {
      bodyText: RESET_COPY.ACKNOWLEDGED,
      buttonLabel: START_MENU_COPY.BUTTON_LABEL,
      rows: START_MENU_ROWS,
    });
    await this._repo.update(updated.id, {
      context: {
        ...updated.context,
        menu_sent_at: new Date().toISOString(),
      },
      last_message_at: new Date().toISOString(),
    });

    log.info("Conversation reset to START by contact keyword", {
      contactPhone: message.contactPhone,
      fromState: row.current_state,
    });
    return { handled: true, action: "RESET_TO_START", currentState: CONVERSATION_STATE.START };
  }

  // ─────────────────────────────────────────────────────────────
  // START STATE
  // ─────────────────────────────────────────────────────────────

  async _resetToStartAndGreet({ clinic, message, wasExpired, log }) {
    const row = await this._repo.upsertToState(clinic.id, message.contactPhone, {
      currentState: CONVERSATION_STATE.START,
      context: { last_wa_message_id: message.waMessageId },
    });
    log.info("conversation_state created/reset to START", {
      contactPhone: message.contactPhone,
      wasExpired,
    });
    await this._sendGreetingMenu(clinic, message.contactPhone, row, log);
    return { handled: true, action: "GREETING_SENT", currentState: CONVERSATION_STATE.START };
  }

  async _handleStart({ clinic, message, row, log }) {
    // Defensive: row says START but the menu never actually went out (e.g. a previous
    // send failed after the DB write succeeded) — resend instead of evaluating a "reply".
    if (!row.context?.menu_sent_at) {
      await this._sendGreetingMenu(clinic, message.contactPhone, row, log);
      return { handled: true, action: "GREETING_SENT", currentState: CONVERSATION_STATE.START };
    }

    const intent = this._resolveMenuIntent(message);

    if (!intent) {
      return this._handleUnrecognizedReply({ clinic, message, row, log });
    }
    if (intent === START_MENU_INTENT.BOOK) {
      return this._transitionToCollectingPatient({ clinic, message, row, log });
    }
    return this._acknowledgeUnsupportedIntent({ clinic, message, row, log });
  }

  /**
   * Only interactive replies to our own menu count as "recognized" — free
   * text is always treated as unrecognized per spec ("use WhatsApp
   * interactive buttons, not free text menu").
   *
   * @returns {string|null}
   */
  _resolveMenuIntent(message) {
    if (message.type !== "list_reply" && message.type !== "button_reply") return null;
    const known = Object.values(START_MENU_INTENT);
    return known.includes(message.replyId) ? message.replyId : null;
  }

  async _sendGreetingMenu(clinic, contactPhone, row, log) {
    const bodyText = START_MENU_COPY.GREETING.replace("{clinicName}", clinic.name ?? "our clinic");
    await this._wa.sendInteractiveList(clinic.whatsapp_phone_number_id, contactPhone, {
      bodyText,
      buttonLabel: START_MENU_COPY.BUTTON_LABEL,
      rows: START_MENU_ROWS,
    });
    await this._repo.update(row.id, {
      context: { ...row.context, menu_sent_at: new Date().toISOString() },
      last_message_at: new Date().toISOString(),
    });
    log.info("Greeting + intent menu sent", { contactPhone });
  }

  async _handleUnrecognizedReply({ clinic, message, row, log }) {
    if (row.retry_count >= START_MENU_RETRY_LIMIT) {
      assertValidConversationTransition(row.current_state, CONVERSATION_STATE.HUMAN_HANDOFF);
      const updated = await this._repo.update(row.id, {
        current_state: CONVERSATION_STATE.HUMAN_HANDOFF,
        context: {
          ...row.context,
          last_wa_message_id: message.waMessageId,
          handoff_reason: HANDOFF_REASON.UNRECOGNIZED_MENU_REPLY,
        },
        last_message_at: new Date().toISOString(),
      });
      await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, START_MENU_COPY.HUMAN_HANDOFF);
      log.warn("Transitioned to HUMAN_HANDOFF after exhausting retries", { contactPhone: message.contactPhone });
      await this._doctorNotifier.notifyHandoff({ clinic, message, reason: HANDOFF_REASON.UNRECOGNIZED_MENU_REPLY, log });
      return { handled: true, action: "HUMAN_HANDOFF", currentState: updated.current_state };
    }

    await this._repo.update(row.id, {
      retry_count: row.retry_count + 1,
      context: { ...row.context, last_wa_message_id: message.waMessageId },
      last_message_at: new Date().toISOString(),
    });
    await this._wa.sendInteractiveList(clinic.whatsapp_phone_number_id, message.contactPhone, {
      bodyText: START_MENU_COPY.REPROMPT,
      buttonLabel: START_MENU_COPY.BUTTON_LABEL,
      rows: START_MENU_ROWS,
    });
    log.info("Re-prompted after unrecognized reply", {
      contactPhone: message.contactPhone,
      retryCount: row.retry_count + 1,
    });
    return { handled: true, action: "REPROMPTED", currentState: CONVERSATION_STATE.START };
  }

  async _transitionToCollectingPatient({ clinic, message, row, log }) {
    assertValidConversationTransition(row.current_state, CONVERSATION_STATE.COLLECTING_PATIENT);
    const updated = await this._repo.update(row.id, {
      current_state: CONVERSATION_STATE.COLLECTING_PATIENT,
      retry_count: 0,
      context: { ...row.context, last_wa_message_id: message.waMessageId, intent: "book" },
      last_message_at: new Date().toISOString(),
    });
    log.info("Transitioned START -> COLLECTING_PATIENT", { contactPhone: message.contactPhone });
    return this._patientSvc.enterState({ clinic, message, row: updated, log });
  }

  /** Reschedule / Cancel / Talk-to-clinic are recognized but not built yet — stay in START. */
  async _acknowledgeUnsupportedIntent({ clinic, message, row, log }) {
    await this._repo.update(row.id, {
      context: { ...row.context, last_wa_message_id: message.waMessageId },
      last_message_at: new Date().toISOString(),
    });
    await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, START_MENU_COPY.UNSUPPORTED_INTENT);
    log.info("Recognized but unimplemented intent — informed user", {
      contactPhone: message.contactPhone,
      intent: message.replyId,
    });
    return { handled: true, action: "UNSUPPORTED_INTENT_ACKNOWLEDGED", currentState: row.current_state };
  }
}
