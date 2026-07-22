/**
 * @fileoverview WhatsApp document-template send for consultation invoices.
 *
 * Meta template `appt_invoice` (DOCUMENT header) is pending review. Until
 * it is approved, `sendInvoiceDocument` logs and no-ops so the rest of the
 * payment.captured → PDF → storage path can ship and be tested.
 *
 * Swap the body of this function for a real WhatsAppClientService document
 * template send once `appt_invoice` is approved — keep the signature stable.
 */

import { createLogger } from "../logger.js";
import { INVOICE_WHATSAPP_TEMPLATE_NAME } from "../constants.js";

const log = createLogger({ component: "sendInvoiceDocument" });

/**
 * Stub: logs the intended WhatsApp invoice document send and returns
 * without calling Meta. Real send will use template
 * {@link INVOICE_WHATSAPP_TEMPLATE_NAME} with a DOCUMENT header `link`.
 *
 * @param {string} phoneNumberId  Clinic's Meta phone_number_id
 * @param {string} patientPhone   E.164 / WhatsApp `to` (digits, no +)
 * @param {string} pdfUrl         HTTPS URL Meta can fetch (signed storage URL)
 * @returns {Promise<{ stubbed: true; templateName: string }>}
 */
export async function sendInvoiceDocument(phoneNumberId, patientPhone, pdfUrl) {
  log.info("sendInvoiceDocument stub — appt_invoice template pending Meta review; skipping WhatsApp document send", {
    phoneNumberId,
    patientPhone,
    pdfUrlPresent: Boolean(pdfUrl),
    templateName: INVOICE_WHATSAPP_TEMPLATE_NAME,
  });
  return { stubbed: true, templateName: INVOICE_WHATSAPP_TEMPLATE_NAME };
}
