import test from "node:test";
import assert from "node:assert/strict";
import { createLiveTranscriptAccumulator } from "../lib/live-transcript-accumulator.js";
import { hasDistinctClinicalSpeakers } from "../lib/speaker-diarization.js";

function diarizedFinal(start, words) {
  let t = start;
  const dgWords = words.map(([word, speaker]) => {
    const w = { word, punctuated_word: word, start: t, end: t + 0.3, confidence: 0.95, speaker };
    t += 0.3;
    return w;
  });
  return {
    type: "Results",
    is_final: true,
    start,
    duration: t - start,
    channel: {
      alternatives: [
        { transcript: words.map(([w]) => w).join(" "), confidence: 0.95, words: dgWords },
      ],
    },
  };
}

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

test("turns from different Deepgram speakers get different clinical labels", () => {
  const acc = createLiveTranscriptAccumulator();
  acc.applyResult(diarizedFinal(0, [["Any", 0], ["cough", 0], ["or", 0], ["cold?", 0]]));
  acc.applyResult(diarizedFinal(2, [["No,", 1], ["doctor.", 1], ["It's", 1], ["fine.", 1]]));
  acc.applyResult(diarizedFinal(4, [["Take", 0], ["rest.", 0]]));

  const result = acc.toTranscriptionResult({ language: "english" });
  assert.deepEqual(
    result.segments.map((s) => [s.speaker_label, s.text]),
    [
      ["Doctor", "Any cough or cold?"],
      ["Patient", "No, doctor. It's fine."],
      ["Doctor", "Take rest."],
    ],
  );
  assert.notEqual(result.segments[0].speaker, result.segments[1].speaker);
  assert.deepEqual(result.speakerMap, { A: "Doctor", B: "Patient" });
  assert.equal(hasDistinctClinicalSpeakers(result.segments), true);
});

test("speaker change inside a single final splits into separate labelled turns", () => {
  const acc = createLiveTranscriptAccumulator();
  const snap = acc.applyResult(
    diarizedFinal(0, [["Fever?", 0], ["Yes,", 1], ["three", 1], ["days.", 1]]),
  );
  assert.deepEqual(
    snap.segments.map((s) => [s.speaker_label, s.text]),
    [
      ["Doctor", "Fever?"],
      ["Patient", "Yes, three days."],
    ],
  );
});

test("live result collapsed to one Deepgram speaker is flagged for batch re-diarization", () => {
  const acc = createLiveTranscriptAccumulator();
  acc.applyResult(diarizedFinal(0, [["Any", 0], ["cough?", 0]]));
  acc.applyResult(diarizedFinal(2, [["No,", 0], ["doctor.", 0], ["It's", 0], ["fine.", 0]]));

  const result = acc.toTranscriptionResult({ language: "english" });
  assert.ok(result.segments.every((s) => s.speaker_label === "Doctor"));
  assert.equal(hasDistinctClinicalSpeakers(result.segments), false);
});

test("hasDistinctClinicalSpeakers ignores Unknown as a second speaker", () => {
  assert.equal(
    hasDistinctClinicalSpeakers([{ speaker_label: "Doctor" }, { speaker_label: "Unknown" }]),
    false,
  );
  assert.equal(hasDistinctClinicalSpeakers([]), false);
});
