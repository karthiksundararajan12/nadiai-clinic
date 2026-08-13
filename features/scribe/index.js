/**
 * @fileoverview features/scribe — public API barrel (client-safe only).
 *
 * Re-exports `@/features/scribe/client` so Client Components that import
 * from `@/features/scribe` never pull in Node-only modules.
 *
 * Server Route Handlers:
 *   Non-PDF: import { createScribeServices } from "@/features/scribe/server-core";
 *   PDF:     import { attachPrescriptionPdf } from "@/features/scribe/server-pdf";
 *   Errors:  import { isScribeError, toApiError } from "@/features/scribe/client";
 *
 * Usage (client):
 *   import { ACTIVE_CONSULTATION_STATUSES } from "@/features/scribe";
 */

export * from "./client.js";
