/**
 * @fileoverview Pure conversation_state state-machine helpers (no I/O).
 */

import { VALID_CONVERSATION_TRANSITIONS } from "../constants.js";
import { InvalidConversationTransitionError } from "../errors.js";

/**
 * @param {string} fromState
 * @param {string} toState
 * @returns {boolean}
 */
export function canTransitionConversation(fromState, toState) {
  return (VALID_CONVERSATION_TRANSITIONS[fromState] ?? []).includes(toState);
}

/**
 * @param {string} fromState
 * @param {string} toState
 * @throws {InvalidConversationTransitionError}
 */
export function assertValidConversationTransition(fromState, toState) {
  if (!canTransitionConversation(fromState, toState)) {
    throw new InvalidConversationTransitionError(fromState, toState);
  }
}
