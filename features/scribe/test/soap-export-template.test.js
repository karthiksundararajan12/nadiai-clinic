import assert from "node:assert/strict";
import test from "node:test";
import { buildSoapExportHtml } from "../lib/soap-export-template.js";

test("buildSoapExportHtml includes SOAP sections and escapes HTML", () => {
  const html = buildSoapExportHtml({
    session: { id: "abc-123", created_at: "2026-01-15T10:00:00Z", status: "SOAP_REVIEWING" },
    doctor: { full_name: "Dr. Patel", specialization: "GP", clinic_name: "Nadi Clinic" },
    patient: { name: "Ravi <test>" },
    note: { subjective: "Headache\n2 days", objective: "BP normal" },
    noteStatus: "reviewing",
    segments: [{ speaker_label: "Doctor", text: "How are you?" }],
  });

  assert.match(html, /Dr\. Patel/);
  assert.match(html, /Ravi &lt;test&gt;/);
  assert.match(html, /Subjective/);
  assert.match(html, /Headache/);
  assert.match(html, /Doctor/);
  assert.doesNotMatch(html, /Session: abc-123/);
  assert.match(html, /Consultation ·/);
  assert.match(html, /Pending Review/);
  assert.match(html, /status-badge--pending_review/);
});
