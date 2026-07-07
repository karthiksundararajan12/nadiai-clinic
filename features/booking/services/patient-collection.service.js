/**
 * @fileoverview PatientCollectionService — the COLLECTING_PATIENT sub-state
 * machine (Session 2).
 *
 * `conversation_state.current_state` stays "COLLECTING_PATIENT" for the
 * entire flow below; progress is tracked via
 * `conversation_state.context.collectingPatientStep` so a single DB column
 * doesn't need a new enum value per screen. On success this transitions
 * `current_state` to SLOT_SELECTION and delegates to SlotSelectionService
 * (Session 3) to present the first list of open slots.
 *
 * Flow:
 *   enterState (called once, right after START -> COLLECTING_PATIENT)
 *     -> existing patients found for (clinic_id, contact_phone)?
 *          yes -> AWAITING_SELECTION (interactive list: patients + "Add new")
 *          no  -> AWAITING_NAME
 *   AWAITING_SELECTION
 *     -> existing patient picked -> consent already on file? SLOT_SELECTION
 *                                   : else -> AWAITING_CONSENT
 *     -> "Add new patient" picked -> AWAITING_NAME
 *   AWAITING_NAME
 *     -> name validated, fuzzy-matched against this contact's existing
 *        patients -> close match found -> AWAITING_DUPLICATE_CONFIRMATION
 *                    no match         -> AWAITING_AGE_OR_DOB
 *   AWAITING_DUPLICATE_CONFIRMATION
 *     -> "yes, same person" -> treated like an existing-patient pick
 *     -> "no, different"    -> AWAITING_AGE_OR_DOB (keeps the typed name)
 *   AWAITING_AGE_OR_DOB
 *     -> valid age/DOB -> AWAITING_CONSENT
 *   AWAITING_CONSENT
 *     -> consent given    -> create/consent-stamp the patient -> SLOT_SELECTION
 *     -> consent declined -> booking abandoned, conversation reset to START
 *
 * Edge case ("second booking flow for a different patient before finishing
 * the first"): conversation_state is a single row per (clinic_id,
 * contact_phone), so there's no separate row to collide with. The concrete
 * way this can happen is the contact tapping a stale "Book an appointment"
 * option again (e.g. from an old cached WhatsApp message) while already
 * mid-flow. Per spec ("reject with message, keep v1 simple") that's
 * detected up front in handleReply() and rejected without disturbing the
 * in-progress step — no queueing, no parallel sub-flows.
 */

import {
  CONVERSATION_STATE,
  COLLECTING_PATIENT_STEP,
  COLLECTING_PATIENT_COPY,
  SHARED_BOOKING_COPY,
  PATIENT_SELECTION_ADD_NEW_ID,
  CONSENT_INTENT,
  DUPLICATE_MATCH_INTENT,
  PATIENT_NAME_FUZZY_MATCH_THRESHOLD,
  START_MENU_INTENT,
} from "../constants.js";
import { assertValidConversationTransition } from "../lib/conversation-transitions.js";
import { validatePatientName, parseAgeOrDob } from "../lib/patient-input.js";
import { findClosestPatientMatch } from "../lib/fuzzy-match.js";
import { buildPatientSelectionRows, parsePatientOptionRowId } from "../lib/patient-list.js";
import { createLogger } from "../logger.js";

export class PatientCollectionService {
  /**
   * @param {import("../repository/conversation-state.repository.js").ConversationStateRepository} conversationRepo
   * @param {import("../repository/patient.repository.js").PatientRepository} patientRepo
   * @param {import("./whatsapp-client.service.js").WhatsAppClientService} whatsappClient
   * @param {import("./slot-selection.service.js").SlotSelectionService} slotSelectionService
   */
  constructor(conversationRepo, patientRepo, whatsappClient, slotSelectionService) {
    this._repo        = conversationRepo;
    this._patientRepo = patientRepo;
    this._wa          = whatsappClient;
    this._slotSvc     = slotSelectionService;
    this._log         = createLogger({ component: "PatientCollectionService" });
  }

  /**
   * Called exactly once, immediately after the START handler transitions
   * `current_state` to COLLECTING_PATIENT — decides the very first screen.
   */
  async enterState({ clinic, message, row, log = this._log }) {
    const patients = await this._patientRepo.findByContact(clinic.id, message.contactPhone);
    if (patients.length > 0) {
      return this._presentPatientList({ clinic, message, row, patients, log });
    }
    return this._promptForName({ clinic, message, row, log });
  }

  /** Called for every subsequent inbound message while current_state === COLLECTING_PATIENT. */
  async handleReply({ clinic, message, row, log = this._log }) {
    if (this._isBookIntentReply(message)) {
      return this._rejectConcurrentBookingAttempt({ clinic, message, row, log });
    }

    switch (row.context?.collectingPatientStep) {
      case COLLECTING_PATIENT_STEP.AWAITING_SELECTION:
        return this._handleSelectionReply({ clinic, message, row, log });
      case COLLECTING_PATIENT_STEP.AWAITING_NAME:
        return this._handleNameReply({ clinic, message, row, log });
      case COLLECTING_PATIENT_STEP.AWAITING_DUPLICATE_CONFIRMATION:
        return this._handleDuplicateConfirmationReply({ clinic, message, row, log });
      case COLLECTING_PATIENT_STEP.AWAITING_AGE_OR_DOB:
        return this._handleAgeOrDobReply({ clinic, message, row, log });
      case COLLECTING_PATIENT_STEP.AWAITING_CONSENT:
        return this._handleConsentReply({ clinic, message, row, log });
      default:
        log.warn("Unknown/missing collectingPatientStep — re-entering patient collection", {
          step: row.context?.collectingPatientStep,
        });
        return this.enterState({ clinic, message, row, log });
    }
  }

  _isBookIntentReply(message) {
    return (
      (message.type === "list_reply" || message.type === "button_reply") &&
      message.replyId === START_MENU_INTENT.BOOK
    );
  }

  async _rejectConcurrentBookingAttempt({ clinic, message, row, log }) {
    const pendingName = row.context?.pendingPatient?.name ?? row.context?.pendingPatient?.full_name;
    const body = SHARED_BOOKING_COPY.CONCURRENT_BOOKING_REJECTED.replace(
      "{forName}",
      pendingName ? ` for ${pendingName}` : "",
    );
    await this._sendTextAndTouch(clinic, message, row, body);
    log.info("Rejected concurrent booking attempt", { contactPhone: message.contactPhone });
    return {
      handled: true,
      action: "CONCURRENT_BOOKING_REJECTED",
      currentState: CONVERSATION_STATE.COLLECTING_PATIENT,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Entry screens
  // ─────────────────────────────────────────────────────────────

  async _presentPatientList({ clinic, message, row, patients, log }) {
    await this._wa.sendInteractiveList(clinic.whatsapp_phone_number_id, message.contactPhone, {
      bodyText: COLLECTING_PATIENT_COPY.LIST_BODY,
      buttonLabel: COLLECTING_PATIENT_COPY.LIST_BUTTON_LABEL,
      rows: buildPatientSelectionRows(patients),
    });
    await this._repo.update(row.id, {
      context: this._touch(row.context, message.waMessageId, {
        collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_SELECTION,
        patientOptions: patients.map((p) => ({ id: p.id, full_name: p.full_name })),
      }),
      last_message_at: new Date().toISOString(),
    });
    log.info("Presented existing-patient selection list", {
      contactPhone: message.contactPhone,
      count: patients.length,
    });
    return { handled: true, action: "PATIENT_LIST_SENT", currentState: CONVERSATION_STATE.COLLECTING_PATIENT };
  }

  async _promptForName({ clinic, message, row, log }) {
    await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, COLLECTING_PATIENT_COPY.ASK_NAME);
    await this._repo.update(row.id, {
      context: this._touch(row.context, message.waMessageId, {
        collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_NAME,
      }),
      last_message_at: new Date().toISOString(),
    });
    log.info("Prompted for new patient name", { contactPhone: message.contactPhone });
    return { handled: true, action: "NAME_PROMPTED", currentState: CONVERSATION_STATE.COLLECTING_PATIENT };
  }

  // ─────────────────────────────────────────────────────────────
  // AWAITING_SELECTION
  // ─────────────────────────────────────────────────────────────

  async _handleSelectionReply({ clinic, message, row, log }) {
    const replyId = message.type === "list_reply" || message.type === "button_reply" ? message.replyId : null;

    if (replyId === PATIENT_SELECTION_ADD_NEW_ID) {
      return this._promptForName({ clinic, message, row, log });
    }

    const patientId = replyId ? parsePatientOptionRowId(replyId) : null;
    const isOfferedOption = Boolean(
      patientId && (row.context?.patientOptions ?? []).some((p) => p.id === patientId),
    );

    if (!isOfferedOption) {
      await this._wa.sendInteractiveList(clinic.whatsapp_phone_number_id, message.contactPhone, {
        bodyText: COLLECTING_PATIENT_COPY.SELECTION_REPROMPT,
        buttonLabel: COLLECTING_PATIENT_COPY.LIST_BUTTON_LABEL,
        rows: buildPatientSelectionRows(row.context?.patientOptions ?? []),
      });
      await this._repo.update(row.id, {
        context: this._touch(row.context, message.waMessageId),
        last_message_at: new Date().toISOString(),
      });
      log.info("Re-prompted patient selection after unrecognized reply", { contactPhone: message.contactPhone });
      return { handled: true, action: "SELECTION_REPROMPTED", currentState: CONVERSATION_STATE.COLLECTING_PATIENT };
    }

    const patient = await this._patientRepo.findById(clinic.id, patientId);
    if (!patient) {
      log.warn("Selected patient no longer found — re-entering patient collection", { patientId });
      return this.enterState({ clinic, message, row, log });
    }
    return this._confirmExistingPatientOrAskConsent({ clinic, message, row, patient, log });
  }

  /** Shared by "picked from the list" and "confirmed as duplicate match". */
  async _confirmExistingPatientOrAskConsent({ clinic, message, row, patient, log }) {
    if (patient.consent_given) {
      return this._transitionToSlotSelection({ clinic, message, row, patient, log });
    }
    return this._promptForConsent({
      clinic,
      message,
      row,
      pendingPatient: { existingPatientId: patient.id, full_name: patient.full_name },
      displayName: patient.full_name,
      log,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // AWAITING_NAME
  // ─────────────────────────────────────────────────────────────

  async _handleNameReply({ clinic, message, row, log }) {
    if (message.type !== "text") {
      await this._sendTextAndTouch(
        clinic,
        message,
        row,
        "Please type the patient's full name (or reply \"cancel\" to start over).",
      );
      return { handled: true, action: "NAME_REPROMPTED", currentState: CONVERSATION_STATE.COLLECTING_PATIENT };
    }

    const validation = validatePatientName(message.text);
    if (!validation.valid) {
      await this._sendTextAndTouch(clinic, message, row, validation.error);
      return { handled: true, action: "NAME_REPROMPTED", currentState: CONVERSATION_STATE.COLLECTING_PATIENT };
    }

    const name = validation.value;
    const candidates = row.context?.patientOptions ?? [];
    const match = findClosestPatientMatch(name, candidates, PATIENT_NAME_FUZZY_MATCH_THRESHOLD);

    if (match) {
      await this._wa.sendInteractiveButtons(clinic.whatsapp_phone_number_id, message.contactPhone, {
        bodyText: COLLECTING_PATIENT_COPY.DUPLICATE_MATCH_PROMPT.replace("{matchName}", match.candidate.full_name),
        buttons: [
          { id: DUPLICATE_MATCH_INTENT.YES, title: COLLECTING_PATIENT_COPY.DUPLICATE_MATCH_YES_LABEL },
          { id: DUPLICATE_MATCH_INTENT.NO, title: COLLECTING_PATIENT_COPY.DUPLICATE_MATCH_NO_LABEL },
        ],
      });
      await this._repo.update(row.id, {
        context: this._touch(row.context, message.waMessageId, {
          collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_DUPLICATE_CONFIRMATION,
          pendingPatient: { name },
          duplicateMatchCandidateId: match.candidate.id,
        }),
        last_message_at: new Date().toISOString(),
      });
      log.info("Possible duplicate patient name detected — asking for confirmation", {
        contactPhone: message.contactPhone,
        score: match.score,
      });
      return {
        handled: true,
        action: "DUPLICATE_CONFIRMATION_PROMPTED",
        currentState: CONVERSATION_STATE.COLLECTING_PATIENT,
      };
    }

    return this._promptForAgeOrDob({ clinic, message, row, name, log });
  }

  // ─────────────────────────────────────────────────────────────
  // AWAITING_DUPLICATE_CONFIRMATION
  // ─────────────────────────────────────────────────────────────

  async _handleDuplicateConfirmationReply({ clinic, message, row, log }) {
    const replyId = message.type === "button_reply" || message.type === "list_reply" ? message.replyId : null;

    if (replyId !== DUPLICATE_MATCH_INTENT.YES && replyId !== DUPLICATE_MATCH_INTENT.NO) {
      await this._sendTextAndTouch(clinic, message, row, COLLECTING_PATIENT_COPY.DUPLICATE_REPROMPT);
      return {
        handled: true,
        action: "DUPLICATE_CONFIRMATION_REPROMPTED",
        currentState: CONVERSATION_STATE.COLLECTING_PATIENT,
      };
    }

    const typedName = row.context?.pendingPatient?.name;

    if (replyId === DUPLICATE_MATCH_INTENT.NO) {
      return this._promptForAgeOrDob({ clinic, message, row, name: typedName, log });
    }

    const patientId = row.context?.duplicateMatchCandidateId;
    const patient = patientId ? await this._patientRepo.findById(clinic.id, patientId) : null;
    if (!patient) {
      log.warn("Duplicate-match candidate no longer found — falling back to age/DOB prompt", { patientId });
      return this._promptForAgeOrDob({ clinic, message, row, name: typedName, log });
    }
    return this._confirmExistingPatientOrAskConsent({ clinic, message, row, patient, log });
  }

  // ─────────────────────────────────────────────────────────────
  // AWAITING_AGE_OR_DOB
  // ─────────────────────────────────────────────────────────────

  async _promptForAgeOrDob({ clinic, message, row, name, log }) {
    const body = COLLECTING_PATIENT_COPY.ASK_AGE_OR_DOB.replace("{name}", name);
    await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, body);
    await this._repo.update(row.id, {
      context: this._touch(row.context, message.waMessageId, {
        collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_AGE_OR_DOB,
        pendingPatient: { name },
      }),
      last_message_at: new Date().toISOString(),
    });
    log.info("Prompted for age/DOB", { contactPhone: message.contactPhone });
    return { handled: true, action: "AGE_OR_DOB_PROMPTED", currentState: CONVERSATION_STATE.COLLECTING_PATIENT };
  }

  async _handleAgeOrDobReply({ clinic, message, row, log }) {
    if (message.type !== "text") {
      await this._sendTextAndTouch(
        clinic,
        message,
        row,
        "Please reply with an age in years or a date of birth (DD-MM-YYYY).",
      );
      return { handled: true, action: "AGE_OR_DOB_REPROMPTED", currentState: CONVERSATION_STATE.COLLECTING_PATIENT };
    }

    const parsed = parseAgeOrDob(message.text);
    if (!parsed.valid) {
      await this._sendTextAndTouch(clinic, message, row, parsed.error);
      return { handled: true, action: "AGE_OR_DOB_REPROMPTED", currentState: CONVERSATION_STATE.COLLECTING_PATIENT };
    }

    const pendingPatient = {
      ...row.context?.pendingPatient,
      ageYears: parsed.ageYears,
      dateOfBirth: parsed.dateOfBirth,
    };
    return this._promptForConsent({
      clinic,
      message,
      row,
      pendingPatient,
      displayName: pendingPatient.name,
      log,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // AWAITING_CONSENT (DPDP)
  // ─────────────────────────────────────────────────────────────

  async _promptForConsent({ clinic, message, row, pendingPatient, displayName, log }) {
    const body = COLLECTING_PATIENT_COPY.ASK_CONSENT.replace("{name}", displayName);
    await this._wa.sendInteractiveButtons(clinic.whatsapp_phone_number_id, message.contactPhone, {
      bodyText: body,
      buttons: [
        { id: CONSENT_INTENT.YES, title: COLLECTING_PATIENT_COPY.CONSENT_YES_LABEL },
        { id: CONSENT_INTENT.NO, title: COLLECTING_PATIENT_COPY.CONSENT_NO_LABEL },
      ],
    });
    await this._repo.update(row.id, {
      context: this._touch(row.context, message.waMessageId, {
        collectingPatientStep: COLLECTING_PATIENT_STEP.AWAITING_CONSENT,
        pendingPatient,
      }),
      last_message_at: new Date().toISOString(),
    });
    log.info("Prompted for DPDP consent", { contactPhone: message.contactPhone });
    return { handled: true, action: "CONSENT_PROMPTED", currentState: CONVERSATION_STATE.COLLECTING_PATIENT };
  }

  async _handleConsentReply({ clinic, message, row, log }) {
    const replyId = message.type === "button_reply" || message.type === "list_reply" ? message.replyId : null;

    if (replyId !== CONSENT_INTENT.YES && replyId !== CONSENT_INTENT.NO) {
      await this._sendTextAndTouch(clinic, message, row, COLLECTING_PATIENT_COPY.CONSENT_REPROMPT);
      return { handled: true, action: "CONSENT_REPROMPTED", currentState: CONVERSATION_STATE.COLLECTING_PATIENT };
    }

    if (replyId === CONSENT_INTENT.NO) {
      return this._handleConsentDeclined({ clinic, message, row, log });
    }

    const pendingPatient = row.context?.pendingPatient ?? {};

    // DPDP requirement: consent is captured explicitly at this step — WhatsApp
    // opt-in never implies it — so an existing patient without consent on
    // file still needs this confirmation before we proceed.
    if (pendingPatient.existingPatientId) {
      const patient = await this._patientRepo.recordConsent(clinic.id, pendingPatient.existingPatientId);
      log.info("Recorded consent for existing patient", {
        contactPhone: message.contactPhone,
        patientId: patient.id,
      });
      return this._transitionToSlotSelection({ clinic, message, row, patient, log });
    }

    const patient = await this._patientRepo.create({
      clinic_id: clinic.id,
      contact_phone: message.contactPhone,
      full_name: pendingPatient.name,
      age_years: pendingPatient.ageYears ?? null,
      date_of_birth: pendingPatient.dateOfBirth ?? null,
    });
    log.info("Created new patient with consent captured", {
      contactPhone: message.contactPhone,
      patientId: patient.id,
    });
    return this._transitionToSlotSelection({ clinic, message, row, patient, log });
  }

  async _handleConsentDeclined({ clinic, message, row, log }) {
    assertValidConversationTransition(row.current_state, CONVERSATION_STATE.START);
    await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, COLLECTING_PATIENT_COPY.CONSENT_DECLINED);
    // Reset to START but deliberately don't resend the greeting here — the
    // next inbound message will trigger it via ConversationStateService's
    // defensive "menu was never sent" branch (current_state=START with no
    // context.menu_sent_at), avoiding duplicated greeting-send logic.
    const updated = await this._repo.update(row.id, {
      current_state: CONVERSATION_STATE.START,
      retry_count: 0,
      context: { last_wa_message_id: message.waMessageId },
      last_message_at: new Date().toISOString(),
    });
    log.info("Consent declined — booking abandoned, conversation reset to START", {
      contactPhone: message.contactPhone,
    });
    return { handled: true, action: "CONSENT_DECLINED", currentState: updated.current_state };
  }

  async _transitionToSlotSelection({ clinic, message, row, patient, log }) {
    assertValidConversationTransition(row.current_state, CONVERSATION_STATE.SLOT_SELECTION);
    const updated = await this._repo.update(row.id, {
      current_state: CONVERSATION_STATE.SLOT_SELECTION,
      retry_count: 0,
      context: this._touch(row.context, message.waMessageId, {
        selectedPatientId: patient.id,
        selectedPatientName: patient.full_name,
      }),
      last_message_at: new Date().toISOString(),
    });
    log.info("Transitioned COLLECTING_PATIENT -> SLOT_SELECTION", {
      contactPhone: message.contactPhone,
      patientId: patient.id,
    });
    return this._slotSvc.enterState({ clinic, message, row: updated, log });
  }

  // ─────────────────────────────────────────────────────────────
  // Shared helpers
  // ─────────────────────────────────────────────────────────────

  _touch(existingContext, waMessageId, extra = {}) {
    return { ...existingContext, last_wa_message_id: waMessageId, ...extra };
  }

  async _sendTextAndTouch(clinic, message, row, body) {
    await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, body);
    await this._repo.update(row.id, {
      context: this._touch(row.context, message.waMessageId),
      last_message_at: new Date().toISOString(),
    });
  }
}
