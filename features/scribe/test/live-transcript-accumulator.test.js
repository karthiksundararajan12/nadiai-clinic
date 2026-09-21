import test from "node:test";
import assert from "node:assert/strict";
import { createLiveTranscriptAccumulator } from "../lib/live-transcript-accumulator.js";

function resultsMessage({ transcript, is_final, start = 0, duration = 1, speaker = 0 }) {
  return {
    type: "Results",
    is_final,
    start,
    duration,
    channel: {
      alternatives: [
        {
          transcript,
          confidence: 0.92,
          words: [
            {
              word: transcript.split(" ")[0],
              punctuated_word: transcript.split(" ")[0],
              start,
              end: start + duration,
              confidence: 0.92,
              speaker,
            },
          ],
        },
      ],
    },
  };
}

test("interim results are marked is_interim until is_final", () => {
  const acc = createLiveTranscriptAccumulator();
  const interim = acc.applyResult(resultsMessage({
    transcript: "hello doctor",
    is_final: false,
  }));
  assert.equal(interim.segments.length, 1);
  assert.equal(interim.segments[0].is_interim, true);
  assert.equal(interim.segments[0].text, "hello doctor");
  assert.equal(interim.text, "");

  const finalSnap = acc.applyResult(resultsMessage({
    transcript: "Hello doctor.",
    is_final: true,
  }));
  assert.equal(finalSnap.segments.length, 1);
  assert.equal(finalSnap.segments[0].is_interim, false);
  assert.equal(finalSnap.text, "Hello doctor.");
});

test("later interim replaces the draft without duplicating finals", () => {
  const acc = createLiveTranscriptAccumulator();
  acc.applyResult(resultsMessage({ transcript: "pain", is_final: true, start: 0 }));
  const draft = acc.applyResult(resultsMessage({
    transcript: "in the",
    is_final: false,
    start: 1.2,
  }));
  assert.equal(draft.segments.length, 2);
  assert.equal(draft.segments[1].is_interim, true);
  assert.equal(draft.segments[1].text, "in the");

  const nextDraft = acc.applyResult(resultsMessage({
    transcript: "in the chest",
    is_final: false,
    start: 1.2,
  }));
  assert.equal(nextDraft.segments.filter((s) => s.is_interim).length, 1);
  assert.equal(nextDraft.segments.at(-1).text, "in the chest");
});

test("toTranscriptionResult omits interim text", () => {
  const acc = createLiveTranscriptAccumulator();
  acc.applyResult(resultsMessage({ transcript: "Settled line.", is_final: true }));
  acc.applyResult(resultsMessage({ transcript: "draft", is_final: false, start: 2 }));
  const result = acc.toTranscriptionResult({ language: "english", durationSeconds: 12 });
  assert.equal(result.text, "Settled line.");
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].text, "Settled line.");
  assert.equal(result.providerResponse.source, "live");
});
