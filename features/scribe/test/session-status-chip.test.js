import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSessionChipStatus } from "../consultation-workspace/lib/session-status-chip.js";
import { formatSessionLabel } from "../consultation-workspace/lib/format-datetime.js";

describe("session-status-chip", () => {
  it("maps approved sessions", () => {
    assert.equal(resolveSessionChipStatus({ status: "SOAP_APPROVED" }), "approved");
    assert.equal(resolveSessionChipStatus({ approval_status: "approved" }), "approved");
  });

  it("maps pending review sessions", () => {
    assert.equal(resolveSessionChipStatus({ status: "SOAP_REVIEW_REQUIRED" }), "pending_review");
    assert.equal(resolveSessionChipStatus({ soap_status: "review_required" }), "pending_review");
  });

  it("maps rejected sessions", () => {
    assert.equal(resolveSessionChipStatus({ soap_status: "rejected" }), "rejected");
  });

  it("defaults to draft", () => {
    assert.equal(resolveSessionChipStatus({ status: "TRANSCRIBING" }), "draft");
  });
});

describe("formatSessionLabel", () => {
  it("formats as day month, time", () => {
    const label = formatSessionLabel("2026-06-11T09:39:00");
    assert.match(label, /^11 Jun, \d{2}:\d{2}$/);
  });
});
