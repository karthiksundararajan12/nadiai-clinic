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
import { formatSlotLabel, slotRowId } from "./slot-engine.js";

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
    id: slotRowId(slot.slotStart),
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
    id: slotRowId(new Date(s.slotStart)),
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
