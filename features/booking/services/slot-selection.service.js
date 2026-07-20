/**
 * @fileoverview SlotSelectionService — the SLOT_SELECTION state handler
 * (Session 3).
 *
 * `conversation_state.current_state` stays "SLOT_SELECTION" while a list of
 * open slots is offered and (if needed) an overlap warning is being
 * confirmed; progress within that is tracked via
 * `conversation_state.context.slotSelectionStep`, mirroring the pattern
 * PatientCollectionService uses for COLLECTING_PATIENT.
 *
 * Flow:
 *   enterState (called once, right after COLLECTING_PATIENT -> SLOT_SELECTION)
 *     -> no doctor configured for this clinic -> HUMAN_HANDOFF
 *     -> compute open slots -> none in the search window -> HUMAN_HANDOFF
 *                            -> present as an interactive list -> AWAITING_SELECTION
 *   AWAITING_SELECTION
 *     -> reply doesn't match an offered slot -> re-prompt (same list)
 *     -> patient already has a CONFIRMED appointment overlapping the chosen
 *        slot -> AWAITING_OVERLAP_CONFIRMATION
 *     -> otherwise -> attempt to book
 *   AWAITING_OVERLAP_CONFIRMATION
 *     -> "yes, book anyway" -> attempt to book the previously-chosen slot
 *     -> "no, let me pick again" -> re-present the same offered list
 *   Booking (attempt to book)
 *     -> INSERT relies entirely on the DB's partial unique index
 *        (appointments_no_double_booking) to resolve the race — never a
 *        check-then-insert. Per spec: "use a DB-level constraint or
 *        transaction, not just an application-level check."
 *     -> lost the race (slot taken in the meantime) -> re-fetch fresh
 *        availability and re-show the (possibly changed) list, prefixed
 *        with an explanation — never fails silently
 *     -> won the race -> resolve the doctor's real consultation_fee
 *        (lib/consultation-fee.js; see PAYMENT_REQUIRED_MIN_FEE's doc
 *        comment in constants.js for why *whether* payment is required
 *        still has no dedicated flag column)
 *          fee not configured  -> HUMAN_HANDOFF (fail loudly rather than
 *                                  silently default an amount — see
 *                                  HANDOFF_REASON.MISSING_CONSULTATION_FEE)
 *          prepayment required -> PAYMENT_PENDING, stamp
 *                                  hold_expires_at = now() + SLOT_HOLD_DURATION_MINUTES,
 *                                  create a real Razorpay Payment Link
 *                                  (RazorpayClientService) for the doctor's
 *                                  actual fee — see PaymentWebhookService
 *                                  for the webhook that confirms it
 *          else                -> CONFIRMED directly
 *
 * PAYMENT_PENDING holds: a slot with a still-active hold is excluded from
 * availability the same as a CONFIRMED one; once `hold_expires_at` passes,
 * it's offered again with no background job involved — see
 * AppointmentRepository's header comment for exactly how expiry is
 * enforced on both the read (availability) and write (booking) paths.
 *
 * Edge case (stray "Book" tap while mid-flow): same rationale and handling
 * as PatientCollectionService's concurrent-booking rejection — detected up
 * front in handleReply() and rejected without disturbing the in-progress
 * step.
 */

import {
  CONVERSATION_STATE,
  SLOT_SELECTION_STEP,
  SLOT_SELECTION_COPY,
  SHARED_BOOKING_COPY,
  START_MENU_INTENT,
  OVERLAP_CONFIRM_INTENT,
  APPOINTMENT_STATUS,
  HANDOFF_REASON,
  SLOT_SEARCH_DAYS_AHEAD,
  SLOT_MIN_LEAD_MINUTES,
  SLOT_DEFAULT_CONSULTATION_DURATION_MINUTES,
  SLOT_LIST_MORE_ROW_ID,
  SLOT_HOLD_DURATION_MINUTES,
  WHATSAPP_CONFIG,
} from "../constants.js";
import { assertValidConversationTransition } from "../lib/conversation-transitions.js";
import {
  normalizeWorkingHours,
  generateCandidateSlots,
  formatSlotLabel,
  parseSlotRowId,
} from "../lib/slot-engine.js";
import {
  buildSlotListPage,
  buildOfferedSlotRows,
  matchOfferedSlotByReplyId,
} from "../lib/slot-list.js";
import { resolveConsultationFee } from "../lib/consultation-fee.js";
import { DatabaseError } from "../errors.js";
import { createLogger } from "../logger.js";

export class SlotSelectionService {
  /**
   * @param {import("../repository/conversation-state.repository.js").ConversationStateRepository} conversationRepo
   * @param {import("../repository/appointment.repository.js").AppointmentRepository} appointmentRepo
   * @param {import("../repository/doctor-profile.repository.js").DoctorProfileRepository} doctorProfileRepo
   * @param {import("./whatsapp-client.service.js").WhatsAppClientService} whatsappClient
   * @param {import("./doctor-notification.service.js").DoctorNotificationService} doctorNotificationService
   * @param {import("./razorpay-client.service.js").RazorpayClientService} razorpayClient
   */
  constructor(conversationRepo, appointmentRepo, doctorProfileRepo, whatsappClient, doctorNotificationService, razorpayClient) {
    this._repo            = conversationRepo;
    this._appointmentRepo = appointmentRepo;
    this._doctorRepo      = doctorProfileRepo;
    this._wa              = whatsappClient;
    this._doctorNotifier  = doctorNotificationService;
    this._razorpay        = razorpayClient;
    this._log             = createLogger({ component: "SlotSelectionService" });
  }

  /**
   * Called exactly once, immediately after PatientCollectionService
   * transitions `current_state` to SLOT_SELECTION.
   */
  async enterState({ clinic, message, row, log = this._log }) {
    const doctor = await this._doctorRepo.findPrimaryByClinicId(clinic.id);
    if (!doctor) {
      log.error("No doctor configured for clinic — cannot compute availability", { clinicId: clinic.id });
      return this._handoff({
        clinic, message, row, log,
        reason: HANDOFF_REASON.NO_DOCTOR_CONFIGURED,
        contactMessage: SLOT_SELECTION_COPY.NO_DOCTOR_HANDOFF,
      });
    }
    return this._presentAvailableSlots({ clinic, message, row, doctor, log });
  }

  /** Called for every subsequent inbound message while current_state === SLOT_SELECTION. */
  async handleReply({ clinic, message, row, log = this._log }) {
    if (this._isBookIntentReply(message)) {
      return this._rejectConcurrentBookingAttempt({ clinic, message, row, log });
    }

    switch (row.context?.slotSelectionStep) {
      case SLOT_SELECTION_STEP.AWAITING_SELECTION:
        return this._handleSlotChoice({ clinic, message, row, log });
      case SLOT_SELECTION_STEP.AWAITING_OVERLAP_CONFIRMATION:
        return this._handleOverlapConfirmationReply({ clinic, message, row, log });
      default:
        log.warn("Unknown/missing slotSelectionStep — re-entering slot selection", {
          step: row.context?.slotSelectionStep,
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
    const patientName = row.context?.selectedPatientName;
    const body = SHARED_BOOKING_COPY.CONCURRENT_BOOKING_REJECTED.replace(
      "{forName}",
      patientName ? ` for ${patientName}` : "",
    );
    await this._sendTextAndTouch(clinic, message, row, body);
    log.info("Rejected concurrent booking attempt", { contactPhone: message.contactPhone });
    return { handled: true, action: "CONCURRENT_BOOKING_REJECTED", currentState: CONVERSATION_STATE.SLOT_SELECTION };
  }

  // ─────────────────────────────────────────────────────────────
  // Presenting availability
  // ─────────────────────────────────────────────────────────────

  async _computeAvailableSlots(clinic, doctor) {
    const now = new Date();
    const windowStart = now;
    const windowEnd = new Date(now.getTime() + SLOT_SEARCH_DAYS_AHEAD * 24 * 60 * 60 * 1000);
    const workingHours = normalizeWorkingHours(doctor.working_hours_start, doctor.working_hours_end);
    const durationMinutes = doctor.consultation_duration || SLOT_DEFAULT_CONSULTATION_DURATION_MINUTES;

    const candidates = generateCandidateSlots({
      workingHoursStart: workingHours.start,
      workingHoursEnd: workingHours.end,
      consultationDurationMinutes: durationMinutes,
      daysAhead: SLOT_SEARCH_DAYS_AHEAD,
      minLeadMinutes: SLOT_MIN_LEAD_MINUTES,
      now,
    });

    const taken = await this._appointmentRepo.findTakenSlotStarts(
      clinic.id,
      doctor.id,
      windowStart.toISOString(),
      windowEnd.toISOString(),
    );
    const takenMs = new Set(taken.map((iso) => new Date(iso).getTime()));

    return candidates.filter((slot) => !takenMs.has(slot.slotStart.getTime()));
  }

  /**
   * Presents the current list of open slots and (re-)sets
   * AWAITING_SELECTION. Used both for the initial entry and for re-showing
   * a fresh list after losing a booking race or declining an overlap
   * warning — always re-queries so a stale list is never redisplayed.
   */
  async _presentAvailableSlots({
    clinic,
    message,
    row,
    doctor,
    log,
    prefixMessage = null,
    offset = 0,
  }) {
    const candidates = await this._computeAvailableSlots(clinic, doctor);

    log.info("Computed open slots before WhatsApp list paging", {
      contactPhone: message.contactPhone,
      doctorId: doctor.id,
      totalAvailable: candidates.length,
      offset,
      whatsappMaxListRows: WHATSAPP_CONFIG.MAX_LIST_ROWS,
    });

    if (candidates.length === 0) {
      log.warn("No open slots in the configured availability window", { doctorId: doctor.id });
      return this._handoff({
        clinic, message, row, log,
        reason: HANDOFF_REASON.NO_SLOTS_AVAILABLE,
        contactMessage: SLOT_SELECTION_COPY.NO_SLOTS_HANDOFF,
      });
    }

    // If the caller asked for a page past the end (stale More tap), wrap to the start.
    const pageOffset = offset >= candidates.length ? 0 : offset;
    const page = buildSlotListPage(candidates, pageOffset);

    if (prefixMessage) {
      await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, prefixMessage);
    }
    await this._wa.sendInteractiveList(clinic.whatsapp_phone_number_id, message.contactPhone, {
      bodyText: SLOT_SELECTION_COPY.LIST_BODY,
      buttonLabel: SLOT_SELECTION_COPY.LIST_BUTTON_LABEL,
      rows: page.rows,
    });

    await this._repo.update(row.id, {
      context: this._touch(row.context, message.waMessageId, {
        slotSelectionStep: SLOT_SELECTION_STEP.AWAITING_SELECTION,
        doctorId: doctor.id,
        offeredSlots: page.pageSlots.map((s) => ({
          slotStart: s.slotStart.toISOString(),
          slotEnd: s.slotEnd.toISOString(),
        })),
        slotListNextOffset: page.nextOffset,
        slotListHasMore: page.hasMore,
        pendingSlot: null,
      }),
      last_message_at: new Date().toISOString(),
    });

    log.info("Presented available slot list page", {
      contactPhone: message.contactPhone,
      pageCount: page.pageSlots.length,
      totalAvailable: page.totalAvailable,
      hasMore: page.hasMore,
      nextOffset: page.nextOffset,
    });
    return { handled: true, action: "SLOTS_PRESENTED", currentState: CONVERSATION_STATE.SLOT_SELECTION };
  }

  // ─────────────────────────────────────────────────────────────
  // AWAITING_SELECTION
  // ─────────────────────────────────────────────────────────────

  async _handleSlotChoice({ clinic, message, row, log }) {
    const replyId = message.type === "list_reply" || message.type === "button_reply" ? message.replyId : null;

    if (replyId === SLOT_LIST_MORE_ROW_ID) {
      const doctor = await this._doctorRepo.findPrimaryByClinicId(clinic.id);
      if (!doctor) {
        return this._handoff({
          clinic, message, row, log,
          reason: HANDOFF_REASON.NO_DOCTOR_CONFIGURED,
          contactMessage: SLOT_SELECTION_COPY.NO_DOCTOR_HANDOFF,
        });
      }
      const nextOffset = row.context?.slotListNextOffset ?? 0;
      log.info("Advancing slot list to next page", {
        contactPhone: message.contactPhone,
        nextOffset,
      });
      return this._presentAvailableSlots({
        clinic,
        message,
        row,
        doctor,
        log,
        offset: nextOffset,
      });
    }

    const offered = row.context?.offeredSlots ?? [];
    // Match using the same row-id encoding slot-list.js puts on WhatsApp rows
    // (exact id equality), not a parallel "raw ISO in, raw ISO out" path that
    // can drift from what was actually sent in the list payload.
    let matched = matchOfferedSlotByReplyId(offered, replyId);

    // Pagination only keeps the *current page* in offeredSlots. A tap on an
    // earlier page's list message still carries a valid booking_slot:<iso>
    // id — resolve it against live availability so we don't falsely reject.
    if (!matched) {
      const chosenIso = replyId ? parseSlotRowId(replyId) : null;
      if (chosenIso) {
        const doctorForLookup = await this._doctorRepo.findPrimaryByClinicId(clinic.id);
        if (doctorForLookup) {
          const available = await this._computeAvailableSlots(clinic, doctorForLookup);
          const found = available.find((s) => s.slotStart.toISOString() === chosenIso);
          if (found) {
            matched = {
              slotStart: found.slotStart.toISOString(),
              slotEnd: found.slotEnd.toISOString(),
            };
            log.info("Accepted slot tap from a prior list page", {
              contactPhone: message.contactPhone,
              chosenIso,
            });
          }
        }
      }
    }

    if (!matched) {
      await this._wa.sendInteractiveList(clinic.whatsapp_phone_number_id, message.contactPhone, {
        bodyText: SLOT_SELECTION_COPY.SELECTION_REPROMPT,
        buttonLabel: SLOT_SELECTION_COPY.LIST_BUTTON_LABEL,
        rows: buildOfferedSlotRows(offered, Boolean(row.context?.slotListHasMore)),
      });
      await this._repo.update(row.id, {
        context: this._touch(row.context, message.waMessageId),
        last_message_at: new Date().toISOString(),
      });
      log.info("Re-prompted slot selection after unrecognized reply", {
        contactPhone: message.contactPhone,
        replyId,
      });
      return { handled: true, action: "SELECTION_REPROMPTED", currentState: CONVERSATION_STATE.SLOT_SELECTION };
    }

    const doctor = await this._doctorRepo.findPrimaryByClinicId(clinic.id);
    if (!doctor) {
      return this._handoff({
        clinic, message, row, log,
        reason: HANDOFF_REASON.NO_DOCTOR_CONFIGURED,
        contactMessage: SLOT_SELECTION_COPY.NO_DOCTOR_HANDOFF,
      });
    }

    return this._checkOverlapThenBook({ clinic, message, row, doctor, slot: matched, log });
  }

  async _checkOverlapThenBook({ clinic, message, row, doctor, slot, log }) {
    const patientId = row.context?.selectedPatientId;
    if (!patientId) {
      log.error("SLOT_SELECTION reached with no selectedPatientId in context — cannot book", {
        contactPhone: message.contactPhone,
      });
      return this._handoff({
        clinic, message, row, log,
        reason: HANDOFF_REASON.MISSING_BOOKING_CONTEXT,
        contactMessage: SLOT_SELECTION_COPY.GENERIC_HANDOFF,
      });
    }

    const overlaps = await this._appointmentRepo.findOverlappingConfirmedForPatient(
      clinic.id,
      patientId,
      slot.slotStart,
      slot.slotEnd,
    );

    if (overlaps.length > 0) {
      return this._warnOverlap({ clinic, message, row, doctor, slot, overlap: overlaps[0], log });
    }

    return this._attemptBooking({ clinic, message, row, doctor, slot, log });
  }

  // ─────────────────────────────────────────────────────────────
  // AWAITING_OVERLAP_CONFIRMATION
  // ─────────────────────────────────────────────────────────────

  async _warnOverlap({ clinic, message, row, doctor, slot, overlap, log }) {
    const patientName = row.context?.selectedPatientName ?? "this patient";
    const body = SLOT_SELECTION_COPY.OVERLAP_WARNING
      .replace("{patientName}", patientName)
      .replace("{existingSlot}", formatSlotLabel(new Date(overlap.slot_start)));

    await this._wa.sendInteractiveButtons(clinic.whatsapp_phone_number_id, message.contactPhone, {
      bodyText: body,
      buttons: [
        { id: OVERLAP_CONFIRM_INTENT.YES, title: SLOT_SELECTION_COPY.OVERLAP_YES_LABEL },
        { id: OVERLAP_CONFIRM_INTENT.NO, title: SLOT_SELECTION_COPY.OVERLAP_NO_LABEL },
      ],
    });

    await this._repo.update(row.id, {
      context: this._touch(row.context, message.waMessageId, {
        slotSelectionStep: SLOT_SELECTION_STEP.AWAITING_OVERLAP_CONFIRMATION,
        pendingSlot: slot,
        doctorId: doctor.id,
      }),
      last_message_at: new Date().toISOString(),
    });

    log.info("Warned about overlapping confirmed appointment — awaiting explicit confirmation", {
      contactPhone: message.contactPhone,
      existingAppointmentId: overlap.id,
    });
    return {
      handled: true,
      action: "OVERLAP_CONFIRMATION_PROMPTED",
      currentState: CONVERSATION_STATE.SLOT_SELECTION,
    };
  }

  async _handleOverlapConfirmationReply({ clinic, message, row, log }) {
    const replyId = message.type === "button_reply" || message.type === "list_reply" ? message.replyId : null;

    if (replyId !== OVERLAP_CONFIRM_INTENT.YES && replyId !== OVERLAP_CONFIRM_INTENT.NO) {
      await this._sendTextAndTouch(clinic, message, row, SLOT_SELECTION_COPY.OVERLAP_REPROMPT);
      return {
        handled: true,
        action: "OVERLAP_CONFIRMATION_REPROMPTED",
        currentState: CONVERSATION_STATE.SLOT_SELECTION,
      };
    }

    const pendingSlot = row.context?.pendingSlot;

    if (replyId === OVERLAP_CONFIRM_INTENT.NO || !pendingSlot) {
      const doctor = await this._doctorRepo.findPrimaryByClinicId(clinic.id);
      if (!doctor) {
        return this._handoff({
          clinic, message, row, log,
          reason: HANDOFF_REASON.NO_DOCTOR_CONFIGURED,
          contactMessage: SLOT_SELECTION_COPY.NO_DOCTOR_HANDOFF,
        });
      }
      log.info("Contact declined to book over an overlapping confirmed appointment — re-showing slots", {
        contactPhone: message.contactPhone,
      });
      return this._presentAvailableSlots({ clinic, message, row, doctor, log });
    }

    const doctor = await this._doctorRepo.findPrimaryByClinicId(clinic.id);
    if (!doctor) {
      return this._handoff({
        clinic, message, row, log,
        reason: HANDOFF_REASON.NO_DOCTOR_CONFIGURED,
        contactMessage: SLOT_SELECTION_COPY.NO_DOCTOR_HANDOFF,
      });
    }
    return this._attemptBooking({ clinic, message, row, doctor, slot: pendingSlot, log });
  }

  // ─────────────────────────────────────────────────────────────
  // Booking
  // ─────────────────────────────────────────────────────────────

  async _attemptBooking({ clinic, message, row, doctor, slot, log }) {
    const fee = resolveConsultationFee(doctor);
    if (!fee.configured) {
      log.error("Doctor has no consultation_fee configured — refusing to book without a real amount to charge (if payment turns out to be required)", {
        doctorId: doctor.id,
      });
      return this._handoff({
        clinic, message, row, log,
        reason: HANDOFF_REASON.MISSING_CONSULTATION_FEE,
        contactMessage: SLOT_SELECTION_COPY.GENERIC_HANDOFF,
      });
    }

    const requiresPrepayment = fee.requiresPrepayment;
    const initialStatus = requiresPrepayment ? APPOINTMENT_STATUS.PAYMENT_PENDING : APPOINTMENT_STATUS.CONFIRMED;
    const holdExpiresAt = requiresPrepayment
      ? new Date(Date.now() + SLOT_HOLD_DURATION_MINUTES * 60 * 1000).toISOString()
      : null;

    const { row: appointment, conflict } = await this._appointmentRepo.createIfAvailable({
      clinic_id: clinic.id,
      doctor_id: doctor.id,
      patient_id: row.context.selectedPatientId,
      contact_phone: message.contactPhone,
      slot_start: slot.slotStart,
      slot_end: slot.slotEnd,
      status: initialStatus,
      wa_message_id: message.waMessageId,
      payment_status: requiresPrepayment ? "pending" : "not_required",
      payment_amount: requiresPrepayment ? fee.feeRupees : null,
      hold_expires_at: holdExpiresAt,
    });

    if (conflict === "SLOT_TAKEN") {
      return this._presentAvailableSlots({
        clinic, message, row, doctor, log,
        prefixMessage: SLOT_SELECTION_COPY.SLOT_TAKEN_REPROMPT,
      });
    }
    if (conflict === "DUPLICATE_MESSAGE") {
      log.warn("Appointment insert hit a wa_message_id conflict — treating as an already-processed webhook redelivery", {
        contactPhone: message.contactPhone,
      });
      return { handled: true, action: "DUPLICATE_SKIPPED", currentState: row.current_state };
    }
    if (conflict) {
      throw new DatabaseError("createIfAvailable", new Error(`Unexpected conflict: ${conflict}`));
    }

    return requiresPrepayment
      ? this._transitionToPaymentPending({ clinic, message, row, doctor, appointment, feeRupees: fee.feeRupees, log })
      : this._transitionToConfirmed({ clinic, message, row, doctor, appointment, log });
  }

  async _transitionToPaymentPending({ clinic, message, row, appointment, feeRupees, log }) {
    assertValidConversationTransition(row.current_state, CONVERSATION_STATE.PAYMENT_PENDING);

    const paymentLink = await this._razorpay.createPaymentLink({
      amountRupees: feeRupees,
      referenceId: appointment.id,
      description: `Consultation fee${clinic.name ? ` — ${clinic.name}` : ""}`,
      notes: { appointment_id: appointment.id, clinic_id: clinic.id },
    });

    const updated = await this._repo.update(row.id, {
      current_state: CONVERSATION_STATE.PAYMENT_PENDING,
      retry_count: 0,
      context: this._touch(row.context, message.waMessageId, {
        appointmentId: appointment.id,
        paymentLinkId: paymentLink.id,
      }),
      last_message_at: new Date().toISOString(),
    });

    const body = SLOT_SELECTION_COPY.PAYMENT_PENDING_MESSAGE
      .replace("{slotLabel}", formatSlotLabel(new Date(appointment.slot_start)))
      .replace("{patientName}", row.context?.selectedPatientName ?? "the patient")
      .replace("{amount}", String(feeRupees))
      .replace("{paymentLink}", paymentLink.shortUrl)
      .replace("{holdMinutes}", String(SLOT_HOLD_DURATION_MINUTES));
    await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, body);

    log.info("Booked slot, transitioned SLOT_SELECTION -> PAYMENT_PENDING with a real Razorpay payment link", {
      contactPhone: message.contactPhone,
      appointmentId: appointment.id,
      paymentLinkId: paymentLink.id,
    });
    return {
      handled: true,
      action: "TRANSITIONED_TO_PAYMENT_PENDING",
      currentState: updated.current_state,
      appointmentId: appointment.id,
    };
  }

  async _transitionToConfirmed({ clinic, message, row, appointment, log }) {
    assertValidConversationTransition(row.current_state, CONVERSATION_STATE.CONFIRMED);
    const updated = await this._repo.update(row.id, {
      current_state: CONVERSATION_STATE.CONFIRMED,
      retry_count: 0,
      context: this._touch(row.context, message.waMessageId, {
        appointmentId: appointment.id,
      }),
      last_message_at: new Date().toISOString(),
    });

    const body = SLOT_SELECTION_COPY.CONFIRMED
      .replace("{patientName}", row.context?.selectedPatientName ?? "Your patient")
      .replace("{clinicName}", clinic.name ?? "the clinic")
      .replace("{slotLabel}", formatSlotLabel(new Date(appointment.slot_start)));
    await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, body);

    log.info("Booked slot, transitioned SLOT_SELECTION -> CONFIRMED", {
      contactPhone: message.contactPhone,
      appointmentId: appointment.id,
    });
    return {
      handled: true,
      action: "TRANSITIONED_TO_CONFIRMED",
      currentState: updated.current_state,
      appointmentId: appointment.id,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // HUMAN_HANDOFF
  // ─────────────────────────────────────────────────────────────

  async _handoff({ clinic, message, row, log, reason, contactMessage }) {
    assertValidConversationTransition(row.current_state, CONVERSATION_STATE.HUMAN_HANDOFF);
    const updated = await this._repo.update(row.id, {
      current_state: CONVERSATION_STATE.HUMAN_HANDOFF,
      context: this._touch(row.context, message.waMessageId, { handoff_reason: reason }),
      last_message_at: new Date().toISOString(),
    });
    await this._wa.sendText(clinic.whatsapp_phone_number_id, message.contactPhone, contactMessage);
    log.warn(`SLOT_SELECTION handoff: ${reason}`, { contactPhone: message.contactPhone });
    await this._doctorNotifier.notifyHandoff({ clinic, message, reason, log });
    return { handled: true, action: "HUMAN_HANDOFF", currentState: updated.current_state };
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
