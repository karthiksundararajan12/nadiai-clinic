/**
 * @fileoverview features/booking — public API barrel (client-safe only).
 *
 * Re-exports `@/features/booking/client` so Client Components that import
 * from `@/features/booking` never pull in Node-only modules.
 *
 * Server Route Handlers:
 *   Non-PDF: import { createBookingServices } from "@/features/booking/server-core";
 *   PDF:     import { attachInvoicePdf } from "@/features/booking/server-pdf";
 *   Errors:  import { isBookingError, toApiError } from "@/features/booking/client";
 *
 * Usage (client):
 *   import { APPOINTMENT_STATUS } from "@/features/booking";
 */

export * from "./client.js";
