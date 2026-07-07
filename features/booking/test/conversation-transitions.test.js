import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionConversation,
  assertValidConversationTransition,
} from "../lib/conversation-transitions.js";
import { CONVERSATION_STATE, VALID_CONVERSATION_TRANSITIONS } from "../constants.js";
import { InvalidConversationTransitionError } from "../errors.js";

test("every transition target is a declared CONVERSATION_STATE value", () => {
  const validStates = new Set(Object.values(CONVERSATION_STATE));
  for (const [from, targets] of Object.entries(VALID_CONVERSATION_TRANSITIONS)) {
    assert.ok(validStates.has(from), `key ${from} is not a valid state`);
    for (const to of targets) {
      assert.ok(validStates.has(to), `target ${to} from ${from} is not a valid state`);
    }
  }
});

test("START -> COLLECTING_PATIENT is a valid transition", () => {
  assert.equal(canTransitionConversation(CONVERSATION_STATE.START, CONVERSATION_STATE.COLLECTING_PATIENT), true);
});

test("START -> HUMAN_HANDOFF is a valid transition", () => {
  assert.equal(canTransitionConversation(CONVERSATION_STATE.START, CONVERSATION_STATE.HUMAN_HANDOFF), true);
});

test("START -> SLOT_SELECTION (skipping COLLECTING_PATIENT) is invalid", () => {
  assert.equal(canTransitionConversation(CONVERSATION_STATE.START, CONVERSATION_STATE.SLOT_SELECTION), false);
});

test("assertValidConversationTransition throws for an invalid transition", () => {
  assert.throws(
    () => assertValidConversationTransition(CONVERSATION_STATE.START, CONVERSATION_STATE.SLOT_SELECTION),
    InvalidConversationTransitionError,
  );
});

test("assertValidConversationTransition does not throw for a valid transition", () => {
  assert.doesNotThrow(() =>
    assertValidConversationTransition(CONVERSATION_STATE.START, CONVERSATION_STATE.COLLECTING_PATIENT),
  );
});
