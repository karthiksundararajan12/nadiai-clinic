/**
 * @fileoverview WhatsApp send for approved prescriptions via Meta template
 * `appt_prescription` (same shape as `appt_invoice` — UTILITY, language `en`).
 *
 * Submit for Meta approval (Business Manager / WABA message_templates):
 *   BODY: "Your prescription for the appointment on {{1}} is attached."
 *   {{1}} = appointment date/time label
 *   No HEADER / BUTTONS on the template (mirror appt_invoice).
 *
 * Until Meta approves the template, keep WHATSAPP_TEMPLATES_LIVE=false (or
 * expect Meta rejections). This helper stubs/logs when templatesLive is false.
 *
 * Because the template is body-only (no DOCUMENT header), the PDF is attached
 * as a free-form `document` message after the template send — requires an open
 * customer-care window for the document part.
 *
 * Gated behind WHATSAPP_TEMPLATES_LIVE (same as sendInvoiceDocument).
 */

import { createLogger } from "../logger.js";
import {
  PRESCRIPTION_WHATSAPP_TEMPLATE_NAME,
  PRESCRIPTION_WHATSAPP_TEMPLATE_LANGUAGE_CODE,
} from "../constants.js";

const log = createLogger({ component: "sendPrescriptionDocument" });

/**
 * @param {string} phoneNumberId  Clinic's Meta phone_number_id
 * @param {string} patientPhone   WhatsApp `to` (digits, no +)
 * @param {string} pdfUrl         HTTPS signed storage URL Meta can fetch
 * @param {{
 *   whatsappClient: import("../../booking/services/whatsapp-client.service.js").WhatsAppClientService;
 *   bodyParams: string[];
 *   filename?: string;
 *   templatesLive?: boolean;
 * }} opts
 * @returns {Promise<{
 *   stubbed?: true;
 *   templateName: string;
 *   templateSent?: boolean;
 *   documentSent?: boolean;
 * }>}
 */
export async function sendPrescriptionDocument(phoneNumberId, patientPhone, pdfUrl, opts) {
  const {
    whatsappClient,
    bodyParams,
    filename = "prescription.pdf",
    templatesLive = process.env.WHATSAPP_TEMPLATES_LIVE === "true",
  } = opts ?? {};

  if (!templatesLive) {
    log.info("WHATSAPP_TEMPLATES_LIVE=false — skipping appt_prescription WhatsApp send (stub until Meta approves template)", {
      phoneNumberId,
      patientPhone,
      pdfUrlPresent: Boolean(pdfUrl),
      templateName: PRESCRIPTION_WHATSAPP_TEMPLATE_NAME,
    });
    return { stubbed: true, templateName: PRESCRIPTION_WHATSAPP_TEMPLATE_NAME };
  }

  if (!whatsappClient) {
    throw new Error("sendPrescriptionDocument requires whatsappClient when WHATSAPP_TEMPLATES_LIVE=true");
  }
  if (!Array.isArray(bodyParams) || bodyParams.length < 1) {
    throw new Error("sendPrescriptionDocument requires bodyParams[0] (appointment date for {{1}})");
  }
  if (!pdfUrl) {
    throw new Error("sendPrescriptionDocument requires pdfUrl (signed prescription PDF URL)");
  }

  await whatsappClient.sendTemplate(phoneNumberId, patientPhone, {
    templateName: PRESCRIPTION_WHATSAPP_TEMPLATE_NAME,
    languageCode: PRESCRIPTION_WHATSAPP_TEMPLATE_LANGUAGE_CODE,
    bodyParams,
  });

  // Body-only template — attach PDF as free-form document (same as invoice).
  await whatsappClient.sendDocument(phoneNumberId, patientPhone, {
    link: pdfUrl,
    filename,
  });

  log.info("Sent appt_prescription template + prescription document", {
    phoneNumberId,
    patientPhone,
    templateName: PRESCRIPTION_WHATSAPP_TEMPLATE_NAME,
    filename,
  });

  return {
    templateName: PRESCRIPTION_WHATSAPP_TEMPLATE_NAME,
    templateSent: true,
    documentSent: true,
  };
}
