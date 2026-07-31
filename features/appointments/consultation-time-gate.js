/**
 * Soft time-gate for "Start Consultation": nudge when the appointment is
 * still more than 2 hours away. Past / near slots proceed without a prompt
 * (doctors running behind schedule is expected).
 */

export const EARLY_CONSULTATION_NUDGE_MS = 2 * 60 * 60 * 1000;

/**
 * @param {string|number|Date|null|undefined} slotStart
 * @param {Date|number} [now]
 * @returns {boolean} true when the UI should ask "start anyway?"
 */
export function shouldNudgeEarlyConsultation(slotStart, now = new Date()) {
  const slotMs =
    slotStart instanceof Date
      ? slotStart.getTime()
      : typeof slotStart === "string" || typeof slotStart === "number"
        ? Date.parse(slotStart)
        : NaN;
  if (!Number.isFinite(slotMs)) return false;

  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) return false;

  return slotMs - nowMs > EARLY_CONSULTATION_NUDGE_MS;
}
