/**
 * @fileoverview Server-only public API for the scribe feature (non-PDF).
 *
 * PDF generation was split out so Next.js NFT does not pull fonts / pdf-lib
 * into every route that imports createScribeServices.
 *
 *   Non-PDF:  import { createScribeServices } from "@/features/scribe/server-core";
 *             (or from this module — re-exports server-core)
 *   PDF:      import { attachPrescriptionPdf, generatePrescriptionPdf } from "@/features/scribe/server-pdf";
 */

export * from "./server-core.js";
