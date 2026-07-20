import test from "node:test";
import assert from "node:assert/strict";
import { buildSlotListPage, buildOfferedSlotRows } from "../lib/slot-list.js";
import {
  SLOT_LIST_MAX_OPTIONS,
  SLOT_LIST_MORE_ROW_ID,
  SLOT_SELECTION_COPY,
  WHATSAPP_CONFIG,
} from "../constants.js";

function makeSlots(count) {
  const base = Date.parse("2026-07-06T03:30:00.000Z");
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(base + i * 20 * 60 * 1000);
    return {
      slotStart: start,
      slotEnd: new Date(start.getTime() + 20 * 60 * 1000),
    };
  });
}

test("buildSlotListPage: ≤10 slots fit in one message with no More row", () => {
  const page = buildSlotListPage(makeSlots(10), 0);
  assert.equal(page.pageSlots.length, 10);
  assert.equal(page.rows.length, 10);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextOffset, 10);
  assert.ok(!page.rows.some((r) => r.id === SLOT_LIST_MORE_ROW_ID));
  assert.ok(page.rows.length <= WHATSAPP_CONFIG.MAX_LIST_ROWS);
});

test("buildSlotListPage: >10 slots pages to 9 slots + More times row", () => {
  const page = buildSlotListPage(makeSlots(27), 0);
  assert.equal(page.totalAvailable, 27);
  assert.equal(page.pageSlots.length, SLOT_LIST_MAX_OPTIONS);
  assert.equal(page.rows.length, SLOT_LIST_MAX_OPTIONS + 1);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextOffset, SLOT_LIST_MAX_OPTIONS);
  assert.equal(page.rows.at(-1).id, SLOT_LIST_MORE_ROW_ID);
  assert.equal(page.rows.at(-1).title, SLOT_SELECTION_COPY.MORE_TIMES_TITLE);
  assert.ok(page.rows.length <= WHATSAPP_CONFIG.MAX_LIST_ROWS);
});

test("buildSlotListPage: second page continues after offset and drops More when remainder fits", () => {
  const first = buildSlotListPage(makeSlots(15), 0);
  assert.equal(first.hasMore, true);
  const second = buildSlotListPage(makeSlots(15), first.nextOffset);
  assert.equal(second.pageSlots.length, 6);
  assert.equal(second.hasMore, false);
  assert.ok(!second.rows.some((r) => r.id === SLOT_LIST_MORE_ROW_ID));
});

test("buildOfferedSlotRows: re-attaches More row for re-prompts", () => {
  const offered = [
    { slotStart: "2026-07-06T03:30:00.000Z", slotEnd: "2026-07-06T03:50:00.000Z" },
  ];
  const withMore = buildOfferedSlotRows(offered, true);
  assert.equal(withMore.length, 2);
  assert.equal(withMore[1].id, SLOT_LIST_MORE_ROW_ID);
  const without = buildOfferedSlotRows(offered, false);
  assert.equal(without.length, 1);
});
