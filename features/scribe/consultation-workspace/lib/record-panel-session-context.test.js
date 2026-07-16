import test from "node:test";
import assert from "node:assert/strict";
import {
  RECORD_PANEL_CONTEXT,
  resolveRecordPanelContext,
  resolveRecordPanelCopy,
} from "./record-panel-session-context.js";

test("resolveRecordPanelContext uses approved-review for history reopen of SOAP_APPROVED session", () => {
  assert.equal(
    resolveRecordPanelContext({
      hasOpenSession: true,
      viewFromHistory: true,
      sessionStatus: "SOAP_APPROVED",
    }),
    RECORD_PANEL_CONTEXT.APPROVED_REVIEW,
  );
});

test("resolveRecordPanelContext uses in-progress for active unfinished consultation", () => {
  assert.equal(
    resolveRecordPanelContext({
      hasOpenSession: true,
      viewFromHistory: false,
      sessionStatus: "SOAP_REVIEWING",
    }),
    RECORD_PANEL_CONTEXT.IN_PROGRESS,
  );
});

test("resolveRecordPanelCopy does not show Session in progress for approved-review", () => {
  const copy = resolveRecordPanelCopy(RECORD_PANEL_CONTEXT.APPROVED_REVIEW, {});
  assert.equal(copy.title, "Approved session");
  assert.match(copy.hint, /reopened for review/i);
  assert.doesNotMatch(copy.title, /in progress/i);
});

test("resolveRecordPanelCopy keeps Session in progress for live unfinished sessions", () => {
  const copy = resolveRecordPanelCopy(RECORD_PANEL_CONTEXT.IN_PROGRESS, {});
  assert.equal(copy.title, "Session in progress");
});
