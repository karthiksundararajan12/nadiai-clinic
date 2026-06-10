import assert from "node:assert/strict";
import test from "node:test";
import { mergeTranscriptionResults } from "../lib/merge-transcription-results.js";

test("mergeTranscriptionResults offsets segment timestamps across chunks", () => {
  const merged = mergeTranscriptionResults(
    [
      {
        text: "Hello doctor",
        language: "en",
        model: "nova-2-medical",
        segments: [{
          id: "0",
          index: 0,
          start: 0,
          end: 1,
          text: "Hello doctor",
          speaker: "A",
          speaker_label: "Doctor",
          confidence: 0.9,
          is_low_confidence: false,
          provider_metadata: {},
        }],
        speakerMap: { A: "Doctor" },
        lowConfidenceSegments: [],
        averageConfidence: 0.9,
        confidenceSummary: { lowConfidenceThreshold: 0.75 },
        providerResponse: {},
        durationSeconds: 1,
        costCents: 1,
      },
      {
        text: "Yes patient",
        language: "en",
        model: "nova-2-medical",
        segments: [{
          id: "0",
          index: 0,
          start: 0,
          end: 1.5,
          text: "Yes patient",
          speaker: "B",
          speaker_label: "Patient",
          confidence: 0.88,
          is_low_confidence: false,
          provider_metadata: {},
        }],
        speakerMap: { B: "Patient" },
        lowConfidenceSegments: [],
        averageConfidence: 0.88,
        confidenceSummary: { lowConfidenceThreshold: 0.75 },
        providerResponse: {},
        durationSeconds: 1.5,
        costCents: 1,
      },
    ],
    [0, 1],
  );

  assert.equal(merged.segments.length, 2);
  assert.equal(merged.segments[1].start, 1);
  assert.equal(merged.text, "Hello doctor\nYes patient");
  assert.equal(merged.chunkCount, 2);
});
