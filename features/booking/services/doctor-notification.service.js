/**
 * @fileoverview DoctorNotificationService — sends the HUMAN_HANDOFF alert to
 * a clinic's doctor(s). Extracted out of ConversationStateService so every
 * state handler that can trigger a handoff (START's exhausted retries,
 * SLOT_SELECTION's "no doctor configured" / "no slots available", and any
 * future state) shares one implementation instead of duplicating it.
 *
 * Best-effort: failures here are logged, never thrown — a notification
 * problem must not roll back the caller's own state transition or block the
 * bot's own reply to the contact.
 *
 * Known limitation: this reuses the same free-form Meta send as the
 * greeting message. Meta only allows free-form (non-template) sends to a
 * recipient who messaged that WABA number within the last 24h — a doctor
 * who hasn't messaged the clinic's WhatsApp number recently may not receive
 * this. A pre-approved template would be required to guarantee delivery;
 * flagged here rather than silently assumed to work.
 */

import { HANDOFF_NOTIFICATION_COPY } from "../constants.js";
import { normalizePhoneForWhatsApp } from "../lib/phone.js";
import { describeInboundMessageForHandoff, describeContactForHandoff } from "../lib/handoff-summary.js";
import { createLogger } from "../logger.js";

export class DoctorNotificationService {
  /**
   * @param {import("../repository/doctor-profile.repository.js").DoctorProfileRepository} doctorProfileRepo
   * @param {import("./whatsapp-client.service.js").WhatsAppClientService} whatsappClient
   */
  constructor(doctorProfileRepo, whatsappClient) {
    this._doctorRepo = doctorProfileRepo;
    this._wa         = whatsappClient;
    this._log        = createLogger({ component: "DoctorNotificationService" });
  }

  /**
   * @param {object} params
   * @param {import("../repository/clinic.repository.js").BookingClinic} params.clinic
   * @param {import("../lib/webhook-parser.js").NormalizedInboundMessage} params.message
   * @param {string} params.reason - One of HANDOFF_REASON's values.
   * @param {import("../logger.js").Logger} [params.log]
   */
  async notifyHandoff({ clinic, message, reason, log = this._log }) {
    let doctors = [];
    try {
      doctors = await this._doctorRepo.findNotifiablePhonesByClinicId(clinic.id);
    } catch (err) {
      log.error("Failed to look up doctor phone(s) for HUMAN_HANDOFF notification", {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (doctors.length === 0) {
      log.warn("No doctor phone on file for clinic — HUMAN_HANDOFF notification not sent", { clinicId: clinic.id });
      return;
    }

    const reasonLine = HANDOFF_NOTIFICATION_COPY.REASON_LINE[reason] ?? "The bot couldn't proceed automatically.";
    const body = HANDOFF_NOTIFICATION_COPY.DOCTOR_ALERT
      .replace("{contactDisplay}", describeContactForHandoff(message))
      .replace("{lastMessage}", describeInboundMessageForHandoff(message))
      .replace("{reasonLine}", reasonLine);

    for (const doctor of doctors) {
      const doctorPhone = normalizePhoneForWhatsApp(doctor.phone);
      if (!doctorPhone) {
        log.warn("Doctor phone on file is not usable for WhatsApp — skipping notification", { doctorId: doctor.id });
        continue;
      }
      try {
        await this._wa.sendText(clinic.whatsapp_phone_number_id, doctorPhone, body);
        log.info("Sent HUMAN_HANDOFF notification to doctor", { doctorId: doctor.id, reason });
      } catch (err) {
        log.error("Failed to send HUMAN_HANDOFF notification to doctor", {
          doctorId: doctor.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
