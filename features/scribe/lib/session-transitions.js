/**
 * @fileoverview Pure session state-machine helpers (no I/O).
 */

import { VALID_TRANSITIONS } from "../constants.js";
import { InvalidStateTransitionError } from "../errors.js";

/**
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
export function canTransitionSession(fromStatus, toStatus) {
  return (VALID_TRANSITIONS[fromStatus] ?? []).includes(toStatus);
}

/**
 * @param {string} fromStatus
 * @param {string} toStatus
 * @throws {InvalidStateTransitionError}
 */
export function assertValidSessionTransition(fromStatus, toStatus) {
  if (!canTransitionSession(fromStatus, toStatus)) {
    throw new InvalidStateTransitionError(fromStatus, toStatus);
  }
}
