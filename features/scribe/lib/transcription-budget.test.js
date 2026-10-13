import test from "node:test";
import assert from "node:assert/strict";
import {
  BATCH_DIARIZATION_TIMEOUT_MS,
  DEEPGRAM_MAX_RETRIES,
  DEEPGRAM_RETRY_BACKOFF_MS,
  TRANSCRIPTION_BUDGET_MS,
  assertTranscriptionBudget,
  capStatusPollIntervalMs,
  createPipelineTimer,
  isTransientDeepgramError,
} from "./transcription-budget.js";

test("budget constants keep Deepgram inside the 60s stop-to-transcript envelope", () => {
  assert.equal(TRANSCRIPTION_BUDGET_MS, 60_000);
  assert.equal(BATCH_DIARIZATION_TIMEOUT_MS, 45_000);
  assert.ok(BATCH_DIARIZATION_TIMEOUT_MS < TRANSCRIPTION_BUDGET_MS);
  assert.equal(DEEPGRAM_MAX_RETRIES, 1);
  assert.ok(DEEPGRAM_RETRY_BACKOFF_MS <= 500);
});

test("assertTranscriptionBudget fails when total exceeds 60s", () => {
  assert.doesNotThrow(() => assertTranscriptionBudget(12_000));
  assert.doesNotThrow(() => assertTranscriptionBudget(60_000));
  assert.throws(
    () => assertTranscriptionBudget(60_001, { phase: "total" }),
    (err) => err.code === "TRANSCRIPTION_BUDGET_EXCEEDED" && /60001ms/.test(err.message),
  );
});

test("pipeline timer marks accumulate and assertBudget fails over 60s", () => {
  let t = 1_000;
  const timer = createPipelineTimer({ now: () => t });
  timer.mark("recorder stop", { durationSeconds: 45, audioSizeBytes: 180_000 });
  t += 2_000;
  timer.mark("upload start");
  t += 3_000;
  timer.mark("upload end", { sessionId: "s1" });
  t += 800;
  timer.mark("transcript saved");
  t += 50;
  timer.mark("UI shown");
  assert.equal(timer.elapsed(), 5_850);
  assert.doesNotThrow(() => timer.assertBudget());

  const names = timer.getMarks().map((m) => m.name);
  assert.deepEqual(names, [
    "recorder stop",
    "upload start",
    "upload end",
    "transcript saved",
    "UI shown",
  ]);

  t += 55_000;
  assert.throws(() => timer.assertBudget(), (err) => err.code === "TRANSCRIPTION_BUDGET_EXCEEDED");
});

test("after-path phase budget (live shown, batch parallel) stays under 60s", () => {
  const after = {
    "recorder stop": 0,
    "upload start/end": 4_000,
    "live-transcript saved": 800,
    "UI shown": 50,
    "batch Deepgram (parallel, does not block)": 18_000,
  };
  const blockingTotal =
    after["recorder stop"] +
    after["upload start/end"] +
    after["live-transcript saved"] +
    after["UI shown"];
  assert.ok(blockingTotal < TRANSCRIPTION_BUDGET_MS);
  assert.ok(after["batch Deepgram (parallel, does not block)"] <= BATCH_DIARIZATION_TIMEOUT_MS);
  assertTranscriptionBudget(blockingTotal, { path: "after-live-first" });
});

test("capStatusPollIntervalMs never exceeds 2s", () => {
  assert.equal(capStatusPollIntervalMs(8_000), 2_000);
  assert.equal(capStatusPollIntervalMs(3_000), 2_000);
  assert.equal(capStatusPollIntervalMs(1_500), 1_500);
  assert.equal(capStatusPollIntervalMs(0), 2_000);
});

test("isTransientDeepgramError allows one 503 retry and rejects timeouts", () => {
  assert.equal(isTransientDeepgramError({ details: { status: 503 } }), true);
  assert.equal(isTransientDeepgramError({ details: { status: 400 } }), false);
  assert.equal(isTransientDeepgramError({ name: "AbortError", message: "aborted" }), false);
  assert.equal(isTransientDeepgramError({ code: "DEEPGRAM_TIMEOUT" }), false);
});
