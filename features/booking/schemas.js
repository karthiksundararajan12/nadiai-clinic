/**
 * @fileoverview Zod validation schemas for the WhatsApp Booking Bot domain.
 *
 * All schemas are exported individually and re-exported from features/booking/index.js.
 * Parse with .safeParse() to get typed results without throwing.
 */

import { z } from "zod";
import { INBOUND_MESSAGE_TYPE } from "./constants.js";

// ─────────────────────────────────────────────────────────────
// NORMALIZED INBOUND MESSAGE
// Output of lib/webhook-parser.js, validated before it reaches the
// conversation-state service.
// ─────────────────────────────────────────────────────────────

export const NormalizedInboundMessageSchema = z.object({
  phoneNumberId: z.string().min(1),
  waMessageId:   z.string().min(1),
  contactPhone:  z.string().min(1),
  contactName:   z.string().nullable().optional(),
  type: z.enum(
    /** @type {[string, ...string[]]} */ (Object.values(INBOUND_MESSAGE_TYPE)),
  ),
  text:       z.string().nullable().optional(),
  replyId:    z.string().nullable().optional(),
  replyTitle: z.string().nullable().optional(),
  timestamp:  z.string().optional(),
});
