/**
 * @fileoverview WhatsApp send for consultation invoices via Meta template
 * `appt_invoice` (approved UTILITY, language `en`).
 *
 * Pulled from Meta Graph API (WABA message_templates) 2026-07-23:
 *   BODY: "Your invoice for the appointment on {{1}} is attached."
 *   {{1}} = appointment date/time label (example placeholder: appointment_date)
 *   No HEADER / BUTTONS components on the approved template.
 *
 * Because the approved template has no DOCUMENT header, the PDF cannot be
 * attached via template components. After the template send we best-effort
 * send the signed storage URL as a free-form `document` message (same
 * WhatsAppClientService / WHATSAPP_ACCESS_TOKEN path as confirmation +
 * reminders). That document send needs an open customer-care window
 * (typical right after booking); failures are logged and never thrown to
 * roll back payment confirm.
 *
 * Gated behind WHATSAPP_TEMPLATES_LIVE (same as ReminderService).
 */

import { createLogger } from "../logger.js";
import {
  INVOICE_WHATSAPP_TEMPLATE_NAME,
  INVOICE_WHATSAPP_TEMPLATE_LANGUAGE_CODE,
} from "../constants.js";

const log = createLogger({ component: "sendInvoiceDocument" });

/**
 * @param {string} phoneNumberId  Clinic's Meta phone_number_id
 * @param {string} patientPhone   WhatsApp `to` (digits, no +)
 * @param {string} pdfUrl         HTTPS signed storage URL Meta can fetch
 * @param {{
 *   whatsappClient: import("./whatsapp-client.service.js").WhatsAppClientService;
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
export async function sendInvoiceDocument(phoneNumberId, patientPhone, pdfUrl, opts) {
  const {
    whatsappClient,
    bodyParams,
    filename = "invoice.pdf",
    templatesLive = process.env.WHATSAPP_TEMPLATES_LIVE === "true",
  } = opts ?? {};

  if (!templatesLive) {
    log.info("WHATSAPP_TEMPLATES_LIVE=false — skipping appt_invoice WhatsApp send", {
      phoneNumberId,
      patientPhone,
      pdfUrlPresent: Boolean(pdfUrl),
      templateName: INVOICE_WHATSAPP_TEMPLATE_NAME,
    });
    return { stubbed: true, templateName: INVOICE_WHATSAPP_TEMPLATE_NAME };
  }

  if (!whatsappClient) {
    throw new Error("sendInvoiceDocument requires whatsappClient when WHATSAPP_TEMPLATES_LIVE=true");
  }
  if (!Array.isArray(bodyParams) || bodyParams.length < 1) {
    throw new Error("sendInvoiceDocument requires bodyParams[0] (appointment date for {{1}})");
  }
  if (!pdfUrl) {
    throw new Error("sendInvoiceDocument requires pdfUrl (signed invoice PDF URL)");
  }

  await whatsappClient.sendTemplate(phoneNumberId, patientPhone, {
    templateName: INVOICE_WHATSAPP_TEMPLATE_NAME,
    languageCode: INVOICE_WHATSAPP_TEMPLATE_LANGUAGE_CODE,
    bodyParams,
  });

  // Approved appt_invoice has no DOCUMENT header — attach PDF as free-form document.
  await whatsappClient.sendDocument(phoneNumberId, patientPhone, {
    link: pdfUrl,
    filename,
  });

  log.info("Sent appt_invoice template + invoice document", {
    phoneNumberId,
    patientPhone,
    templateName: INVOICE_WHATSAPP_TEMPLATE_NAME,
    filename,
  });

  return {
    templateName: INVOICE_WHATSAPP_TEMPLATE_NAME,
    templateSent: true,
    documentSent: true,
  };
}
