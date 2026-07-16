import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmRecordingLeave,
  isRecordingGuardActive,
  setRecordingGuardActive,
  shouldBlockNavigation,
} from "./recording-guard.js";

test("shouldBlockNavigation blocks only when recording is active and path changes", () => {
  setRecordingGuardActive(false);
  assert.equal(shouldBlockNavigation("/scribe", "/appointments"), false);

  setRecordingGuardActive(true);
  assert.equal(shouldBlockNavigation("/scribe", "/appointments"), true);
  assert.equal(shouldBlockNavigation("/scribe", "/scribe"), false);

  setRecordingGuardActive(false);
});

test("isRecordingGuardActive reflects setRecordingGuardActive", () => {
  setRecordingGuardActive(true);
  assert.equal(isRecordingGuardActive(), true);
  setRecordingGuardActive(false);
  assert.equal(isRecordingGuardActive(), false);
});

test("confirmRecordingLeave returns true without window in node tests", () => {
  assert.equal(confirmRecordingLeave(), true);
});
