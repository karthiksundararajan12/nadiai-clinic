import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  splitSectionIntoStatements,
  computeStatementEvidence,
  buildStatementEvidenceMappings,
  isLowConfidence,
} from "../consultation-workspace/lib/soap-statement-evidence.js";

describe("soap-statement-evidence", () => {
  const segments = [
    {
      id: "seg-1",
      text: "I have fever for 5 days.",
      confidence: 0.98,
      speaker_label: "Patient",
    },
    {
      id: "seg-2",
      text: "Blood pressure is 120 over 80.",
      confidence: 0.9,
      speaker_label: "Doctor",
    },
  ];

  it("splits section text into statements", () => {
    const statements = splitSectionIntoStatements("subjective", "Fever for 5 days.\nCough present.");
    assert.equal(statements.length, 2);
    assert.equal(statements[0].text, "Fever for 5 days.");
  });

  it("matches statement to transcript segment", () => {
    const statement = { id: "subjective-0", sectionKey: "subjective", text: "Patient reports fever for 5 days." };
    const evidence = computeStatementEvidence(statement, segments);
    assert.equal(evidence.transcriptSegmentId, "seg-1");
    assert.equal(evidence.speaker, "Patient");
    assert.ok(evidence.confidence >= 35);
  });

  it("flags low confidence below 70%", () => {
    const evidence = { confidence: 55, status: "partial" };
    assert.equal(isLowConfidence(evidence), true);
  });

  it("builds mappings for all draft sections", () => {
    const draft = {
      subjective: "I have fever for 5 days.",
      objective: "Not documented in transcript.",
    };
    const mappings = buildStatementEvidenceMappings(draft, segments);
    assert.ok(mappings.length >= 2);
    assert.ok(mappings.some((m) => m.soapStatementId.startsWith("subjective")));
  });
});
