import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_STATUS,
  TERMINAL_STATUSES,
  VALID_TRANSITIONS,
} from "../constants.js";
import {
  assertValidSessionTransition,
  canTransitionSession,
} from "../lib/session-transitions.js";
import { InvalidStateTransitionError } from "../errors.js";

test("every VALID_TRANSITIONS target is a known SESSION_STATUS value", () => {
  const known = new Set(Object.values(SESSION_STATUS));
  for (const [from, targets] of Object.entries(VALID_TRANSITIONS)) {
    assert.ok(known.has(from), `unknown from status: ${from}`);
    for (const to of targets) {
      assert.ok(known.has(to), `unknown to status: ${to} from ${from}`);
    }
  }
});

test("COMPLETED cannot transition to REVIEWING", () => {
  assert.equal(
    canTransitionSession(SESSION_STATUS.COMPLETED, SESSION_STATUS.REVIEWING),
    false,
  );
});

test("TRANSCRIBED can transition to REVIEWING", () => {
  assert.equal(
    canTransitionSession(SESSION_STATUS.TRANSCRIBED, SESSION_STATUS.REVIEWING),
    true,
  );
});

test("SOAP_APPROVED can transition to COMPLETED", () => {
  assert.equal(
    canTransitionSession(SESSION_STATUS.SOAP_APPROVED, SESSION_STATUS.COMPLETED),
    true,
  );
});

test("assertValidSessionTransition throws InvalidStateTransitionError", () => {
  assert.throws(
    () => assertValidSessionTransition(SESSION_STATUS.COMPLETED, SESSION_STATUS.REVIEWING),
    InvalidStateTransitionError,
  );
});

test("terminal statuses have no outgoing transitions to pipeline states", () => {
  for (const terminal of TERMINAL_STATUSES) {
    const outgoing = VALID_TRANSITIONS[terminal] ?? [];
    assert.ok(
      !outgoing.includes(SESSION_STATUS.REVIEWING),
      `${terminal} must not allow REVIEWING`,
    );
    assert.ok(
      !outgoing.includes(SESSION_STATUS.TRANSCRIBED),
      `${terminal} must not allow TRANSCRIBED`,
    );
  }
});
