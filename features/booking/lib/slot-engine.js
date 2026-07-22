/**
 * @fileoverview Pure slot-generation, formatting, and row-id helpers for
 * SLOT_SELECTION (no I/O — availability filtering against existing
 * appointments happens in the service layer, which calls into these
 * helpers with plain data).
 *
 * Timezone note: there is no per-clinic timezone column yet (ARCHITECTURE.md
 * open decision #1), so every clinic is assumed to run on India Standard
 * Time — a fixed UTC+05:30 offset with no DST. All arithmetic below is done
 * by shifting UTC instants and reading UTC getters, which is deliberately
 * independent of the server process's local timezone (safe to run this on
 * a server anywhere in the world and get identical results).
 */

import {
  SLOT_TIMEZONE_OFFSET,
  SLOT_ROW_ID_PREFIX,
  SLOT_DEFAULT_WORKING_HOURS_START,
  SLOT_DEFAULT_WORKING_HOURS_END,
} from "../constants.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const WORKING_HOURS_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Validates doctor_profiles.working_hours_start/end (free-text columns) and
 * falls back to sane defaults if either is missing or malformed, rather
 * than letting bad config silently produce zero or bogus slots.
 *
 * @param {string|null|undefined} start
 * @param {string|null|undefined} end
 * @returns {{ start: string; end: string; usedFallback: boolean }}
 */
export function normalizeWorkingHours(start, end) {
  const startValid = typeof start === "string" && WORKING_HOURS_PATTERN.test(start);
  const endValid = typeof end === "string" && WORKING_HOURS_PATTERN.test(end);
  const normalizedStart = startValid ? start : SLOT_DEFAULT_WORKING_HOURS_START;
  const normalizedEnd = endValid ? end : SLOT_DEFAULT_WORKING_HOURS_END;
  if (!startValid || !endValid || normalizedEnd <= normalizedStart) {
    return {
      start: SLOT_DEFAULT_WORKING_HOURS_START,
      end: SLOT_DEFAULT_WORKING_HOURS_END,
      usedFallback: true,
    };
  }
  return { start: normalizedStart, end: normalizedEnd, usedFallback: false };
}

/** @returns {{ year: number; month: number; day: number }} The IST calendar date for a UTC instant. */
function toIstDateParts(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function addDaysToDateParts({ year, month, day }, daysToAdd) {
  const shifted = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function formatDateParts({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Converts an IST wall-clock instant (calendar date + "HH:mm") to the corresponding UTC Date. */
function istWallClockToUtcDate(dateParts, hhmm) {
  return new Date(`${formatDateParts(dateParts)}T${hhmm}:00${SLOT_TIMEZONE_OFFSET}`);
}

/**
 * Generates every candidate appointment slot for a doctor over the next
 * `daysAhead` calendar days (IST), evenly spaced by consultation duration
 * within the doctor's working hours, excluding anything closer than
 * `minLeadMinutes` from `now`. Does not know about existing bookings —
 * callers filter those out separately (kept separate so this stays a pure
 * function with no DB dependency).
 *
 * @param {object} params
 * @param {string} params.workingHoursStart - "HH:mm", already normalized
 * @param {string} params.workingHoursEnd - "HH:mm", already normalized
 * @param {number} params.consultationDurationMinutes
 * @param {number} params.daysAhead
 * @param {number} params.minLeadMinutes
 * @param {Date} [params.now]
 * @returns {{ slotStart: Date; slotEnd: Date }[]}
 */
export function generateCandidateSlots({
  workingHoursStart,
  workingHoursEnd,
  consultationDurationMinutes,
  daysAhead,
  minLeadMinutes,
  now = new Date(),
}) {
  const durationMs = consultationDurationMinutes * 60 * 1000;
  const earliestAllowedMs = now.getTime() + minLeadMinutes * 60 * 1000;
  const todayIst = toIstDateParts(now);
  const slots = [];

  for (let offset = 0; offset < daysAhead; offset++) {
    const dayParts = addDaysToDateParts(todayIst, offset);
    const dayStart = istWallClockToUtcDate(dayParts, workingHoursStart);
    const dayEnd = istWallClockToUtcDate(dayParts, workingHoursEnd);

    for (
      let slotStartMs = dayStart.getTime();
      slotStartMs + durationMs <= dayEnd.getTime();
      slotStartMs += durationMs
    ) {
      if (slotStartMs >= earliestAllowedMs) {
        slots.push({ slotStart: new Date(slotStartMs), slotEnd: new Date(slotStartMs + durationMs) });
      }
    }
  }

  return slots;
}

/**
 * Formats a slot's start into separate IST date + time strings for
 * patient-facing copy (e.g. confirmed-appointment fallback).
 *
 * @param {Date} date
 * @returns {{ date: string; time: string }} e.g. `{ date: "Mon 6 Jul", time: "9:00 AM" }`
 */
export function formatSlotDateTimeParts(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const weekday = WEEKDAY_LABELS[ist.getUTCDay()];
  const day = ist.getUTCDate();
  const month = MONTH_LABELS[ist.getUTCMonth()];
  let hours = ist.getUTCHours();
  const minutes = String(ist.getUTCMinutes()).padStart(2, "0");
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return {
    date: `${weekday} ${day} ${month}`,
    time: `${hours}:${minutes} ${meridiem}`,
  };
}

/**
 * Formats a slot's start time for a WhatsApp list row title in IST,
 * e.g. "Mon 6 Jul, 10:00 AM" — kept to ~21 chars max, under Meta's 24-char
 * row title limit.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatSlotLabel(date) {
  const { date: slotDate, time: slotTime } = formatSlotDateTimeParts(date);
  return `${slotDate}, ${slotTime}`;
}

/** @param {Date} slotStart @returns {string} */
export function slotRowId(slotStart) {
  return `${SLOT_ROW_ID_PREFIX}${slotStart.toISOString()}`;
}

/**
 * @param {string} rowId
 * @returns {string|null} The slot's canonical ISO start timestamp
 *   (`Date#toISOString()`), or null if `rowId` isn't a slot-selection row id
 *   (e.g. it's some other menu's row id).
 */
export function parseSlotRowId(rowId) {
  if (typeof rowId !== "string" || !rowId.startsWith(SLOT_ROW_ID_PREFIX)) return null;
  const raw = rowId.slice(SLOT_ROW_ID_PREFIX.length);
  const ms = new Date(raw).getTime();
  // Always return the canonical toISOString() form so callers can compare
  // against offeredSlots (also stored via toISOString) without format drift
  // like "...00Z" vs "...00.000Z".
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
