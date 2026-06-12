import test from "node:test";
import assert from "node:assert/strict";
import { parseManualTranscript } from "../lib/manual-transcript-parser.js";

test("parseManualTranscript splits labeled lines", () => {
  const { segments, fullText } = parseManualTranscript(
    "Doctor: How are you feeling?\nPatient: I have a headache.",
  );

  assert.equal(fullText.includes("Doctor:"), true);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].speaker_label, "Doctor");
  assert.equal(segments[0].text, "How are you feeling?");
  assert.equal(segments[1].speaker_label, "Patient");
  assert.equal(segments[1].text, "I have a headache.");
});

test("parseManualTranscript alternates speakers for unlabeled lines", () => {
  const { segments } = parseManualTranscript("Hello there.\nFine thanks.");

  assert.equal(segments.length, 2);
  assert.equal(segments[0].speaker_label, "Patient");
  assert.equal(segments[1].speaker_label, "Doctor");
});

test("parseManualTranscript returns empty segments for blank input", () => {
  const { segments, fullText } = parseManualTranscript("   \n  ");
  assert.equal(segments.length, 0);
  assert.equal(fullText, "");
});
