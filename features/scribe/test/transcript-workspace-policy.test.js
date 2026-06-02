import test from "node:test";
import assert from "node:assert/strict";
import { SESSION_STATUS } from "../constants.js";
import { resolveTranscriptWorkspaceAccess } from "../lib/transcript-workspace-policy.js";

test("TRANSCRIBED opens editable workspace and transitions to REVIEWING", () => {
  const access = resolveTranscriptWorkspaceAccess(SESSION_STATUS.TRANSCRIBED);
  assert.deepEqual(access, {
    mode: "editable",
    readOnly: false,
    transitionToReviewing: true,
  });
});

test("REVIEWING stays editable without re-transition", () => {
  const access = resolveTranscriptWorkspaceAccess(SESSION_STATUS.REVIEWING);
  assert.equal(access.mode, "editable");
  assert.equal(access.readOnly, false);
  assert.equal(access.transitionToReviewing, false);
});

test("COMPLETED opens read-only transcript workspace", () => {
  const access = resolveTranscriptWorkspaceAccess(SESSION_STATUS.COMPLETED);
  assert.deepEqual(access, {
    mode: "readonly",
    readOnly: true,
    transitionToReviewing: false,
  });
});

test("SOAP_APPROVED opens read-only transcript workspace", () => {
  const access = resolveTranscriptWorkspaceAccess(SESSION_STATUS.SOAP_APPROVED);
  assert.equal(access.mode, "readonly");
  assert.equal(access.readOnly, true);
});

test("UPLOADED has no transcript workspace", () => {
  const access = resolveTranscriptWorkspaceAccess(SESSION_STATUS.UPLOADED);
  assert.equal(access.mode, "unavailable");
});
