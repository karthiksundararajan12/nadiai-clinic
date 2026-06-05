import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAppearanceSpeakerMap,
  buildSegmentsFromDiarizedWords,
  countUniqueSpeakerLabels,
} from "../lib/speaker-diarization.js";

test("buildAppearanceSpeakerMap assigns Doctor then Patient by first appearance", () => {
  const map = buildAppearanceSpeakerMap([
    { speaker: 1 },
    { speaker: 0 },
    { speaker: 1 },
  ]);
  assert.equal(map.get(1)?.label, "Doctor");
  assert.equal(map.get(0)?.label, "Patient");
});

test("buildSegmentsFromDiarizedWords alternates Patient and Doctor", () => {
  const map = buildAppearanceSpeakerMap([
    { speaker: 0 },
    { speaker: 1 },
  ]);
  const segments = buildSegmentsFromDiarizedWords(
    [
      { word: "hello", punctuated_word: "Hello", start: 0, end: 0.5, speaker: 0, confidence: 0.9 },
      { word: "doctor", punctuated_word: "doctor.", start: 0.5, end: 1, speaker: 0, confidence: 0.9 },
      { word: "yes", punctuated_word: "Yes", start: 1.2, end: 1.5, speaker: 1, confidence: 0.88 },
      { word: "patient", punctuated_word: "patient.", start: 1.5, end: 2, speaker: 1, confidence: 0.88 },
    ],
    map,
  );

  assert.equal(segments.length, 2);
  assert.equal(segments[0].speaker_label, "Doctor");
  assert.equal(segments[1].speaker_label, "Patient");
  assert.equal(countUniqueSpeakerLabels(segments), 2);
});
