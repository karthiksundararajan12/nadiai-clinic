/**
 * @fileoverview Pure helpers for paging open appointment slots into a
 * WhatsApp interactive list payload (no I/O).
 *
 * Meta caps interactive "list" messages at WHATSAPP_CONFIG.MAX_LIST_ROWS
 * rows **total across all sections** — Morning/Afternoon/Evening sections
 * do not raise capacity. When more open slots exist than fit, we show a
 * page of slots plus a trailing "More times →" row and advance an offset
 * stored on conversation_state.context.
 */

import {
  SLOT_LIST_MAX_OPTIONS,
  SLOT_LIST_MORE_ROW_ID,
  SLOT_SELECTION_COPY,
  WHATSAPP_CONFIG,
} from "../constants.js";
import { formatSlotLabel, parseSlotRowId, slotRowId } from "./slot-engine.js";

/**
 * Row id for a persisted offered slot — must match what buildSlotListPage /
 * buildOfferedSlotRows put in the WhatsApp list payload.
 *
 * @param {{ slotStart: string|Date }} slot
 * @returns {string}
 */
export function offeredSlotRowId(slot) {
  return slotRowId(slot.slotStart instanceof Date ? slot.slotStart : new Date(slot.slotStart));
}

/**
 * Resolve a WhatsApp list_reply id to one of the currently offered slots.
 * Uses the exact same row-id encoding as the list builder (not a parallel
 * ISO-string convention) so pagination / re-prompt paths cannot drift.
 *
 * @param {Array<{ slotStart: string; slotEnd: string }>|null|undefined} offeredSlots
 * @param {string|null|undefined} replyId
 * @returns {{ slotStart: string; slotEnd: string }|null}
 */
export function matchOfferedSlotByReplyId(offeredSlots, replyId) {
  if (!replyId || replyId === SLOT_LIST_MORE_ROW_ID) return null;
  const offered = offeredSlots ?? [];

  const byExactRowId = offered.find((s) => offeredSlotRowId(s) === replyId);
  if (byExactRowId) return byExactRowId;

  // Defensive: accept a parseable booking_slot:<iso> even if string form
  // differs slightly (e.g. missing milliseconds) from the stored ISO.
  const chosenIso = parseSlotRowId(replyId);
  if (!chosenIso) return null;
  const chosenMs = new Date(chosenIso).getTime();
  if (Number.isNaN(chosenMs)) return null;
  return offered.find((s) => new Date(s.slotStart).getTime() === chosenMs) ?? null;
}

/**
 * @param {{ slotStart: Date; slotEnd: Date }[]} candidates - open slots, earliest first
 * @param {number} [offset=0]
 * @returns {{
 *   pageSlots: { slotStart: Date; slotEnd: Date }[];
 *   rows: Array<{ id: string; title: string }>;
 *   nextOffset: number;
 *   hasMore: boolean;
 *   totalAvailable: number;
 * }}
 */
export function buildSlotListPage(candidates, offset = 0) {
  const safeOffset = Math.max(0, Number.isFinite(offset) ? offset : 0);
  const remaining = candidates.slice(safeOffset);
  const hasMore = remaining.length > WHATSAPP_CONFIG.MAX_LIST_ROWS;
  const pageSize = hasMore ? SLOT_LIST_MAX_OPTIONS : remaining.length;
  const pageSlots = remaining.slice(0, pageSize);

  const rows = pageSlots.map((slot) => ({
    id: offeredSlotRowId(slot),
    title: formatSlotLabel(slot.slotStart),
  }));

  if (hasMore) {
    rows.push({
      id: SLOT_LIST_MORE_ROW_ID,
      title: SLOT_SELECTION_COPY.MORE_TIMES_TITLE,
    });
  }

  return {
    pageSlots,
    rows,
    nextOffset: safeOffset + pageSlots.length,
    hasMore,
    totalAvailable: candidates.length,
  };
}

/**
 * Rebuilds list rows for the currently offered page (re-prompt path),
 * re-attaching the "More times →" row when the previous page had more.
 *
 * @param {Array<{ slotStart: string; slotEnd: string }>} offeredSlots
 * @param {boolean} hasMore
 */
export function buildOfferedSlotRows(offeredSlots, hasMore = false) {
  const rows = (offeredSlots ?? []).map((s) => ({
    id: offeredSlotRowId(s),
    title: formatSlotLabel(new Date(s.slotStart)),
  }));
  if (hasMore) {
    rows.push({
      id: SLOT_LIST_MORE_ROW_ID,
      title: SLOT_SELECTION_COPY.MORE_TIMES_TITLE,
    });
  }
  return rows;
}
