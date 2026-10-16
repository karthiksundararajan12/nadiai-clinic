import test from "node:test";
import assert from "node:assert/strict";
import { assessTranscriptSufficiency } from "./transcript-sufficiency.js";

test("SOAP is blocked when the transcript is under 20 words or under 10 seconds", () => {
  const short = assessTranscriptSufficiency({
    text: "Hello doctor I have a fever",
    segments: [{ text: "Hello doctor I have a fever", start_seconds: 0, end_seconds: 12 }],
  });
  assert.equal(short.ok, false);
  assert.equal(short.code, "insufficient_transcript");

  const brief = assessTranscriptSufficiency({
    text: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty",
    segments: [{ text: "spoken", start_seconds: 0, end_seconds: 4 }],
  });
  assert.equal(brief.ok, false);

  const enough = assessTranscriptSufficiency({
    text: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one",
    segments: [{ text: "spoken", start: 0, end: 12 }],
  });
  assert.equal(enough.ok, true);

  const untimed = assessTranscriptSufficiency({
    text: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one",
    segments: [{ text: "spoken" }],
  });
  assert.equal(untimed.ok, true);
});
