/**
 * @fileoverview Server-only invoice PDF API for the booking feature.
 *
 * Import this only from routes that generate invoice PDFs (Razorpay payment
 * confirm). Pulls in pdf-lib, fontkit, Noto Sans font files, and node:fs.
 *
 * Usage:
 *   import { attachInvoicePdf, generateInvoicePdf } from "@/features/booking/server-pdf";
 */

export { InvoiceService } from "./services/invoice.service.js";
export { sendInvoiceDocument } from "./services/invoice-whatsapp.js";
export {
  generateInvoicePdf,
  buildInvoiceDisplayFields,
  formatInvoiceNumber,
} from "./lib/invoice-pdf.js";

import { InvoiceService } from "./services/invoice.service.js";
import { createBookingServices } from "./server-core.js";

/**
 * Late-bind InvoiceService onto a services bag from createBookingServices
 * (server-core). Call only on routes that need invoice PDF generation.
 *
 * @param {ReturnType<typeof createBookingServices>} services
 * @returns {ReturnType<typeof createBookingServices>}
 */
export function attachInvoicePdf(services) {
  if (!services?.invoiceRepository || !services?.invoiceStorageService) {
    throw new Error(
      "attachInvoicePdf: services must come from createBookingServices (server-core)",
    );
  }
  const invoiceService = new InvoiceService(
    services.invoiceRepository,
    services.invoiceStorageService,
    services.clinicRepository,
    services.patientRepository,
    services.doctorProfileRepository,
    {
      whatsappClient: services.whatsappClient,
      templatesLive: process.env.WHATSAPP_TEMPLATES_LIVE === "true",
    },
  );
  services.invoiceService = invoiceService;
  services.paymentWebhookService.attachInvoiceService(invoiceService);
  if (typeof services.slotSelectionService?.attachInvoiceService === "function") {
    services.slotSelectionService.attachInvoiceService(invoiceService);
  }
  return services;
}

/**
 * Convenience: createBookingServices + attachInvoicePdf.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient]
 */
export function createBookingServicesWithPdf(supabaseClient) {
  return attachInvoicePdf(createBookingServices(supabaseClient));
}
