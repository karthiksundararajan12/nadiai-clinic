import test from "node:test";
import assert from "node:assert/strict";

process.env.DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "test-deepgram-key";

const { DeepgramProvider } = await import("../services/transcription-providers/deepgram.provider.js");
const { DEEPGRAM_MAX_RETRIES, DEEPGRAM_RETRY_BACKOFF_MS } = await import("../lib/transcription-budget.js");

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const DG_RESULT = {
  metadata: { duration: 4, channels: 1 },
  results: {
    utterances: [
      { transcript: "Hello", start: 0, end: 1, speaker: 0, confidence: 0.9, words: [] },
    ],
    channels: [{ alternatives: [{ transcript: "Hello", confidence: 0.9, words: [] }] }],
  },
};

test("Deepgram sends signed URL JSON instead of audio bytes", async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return jsonResponse(DG_RESULT);
  };
  try {
    const provider = new DeepgramProvider("test-deepgram-key");
    const result = await provider.transcribe({
      audioUrl: "https://example.supabase.co/storage/v1/object/sign/scribe-audio/a.webm?token=abc",
      language: "english",
      sessionId: "sess-url",
      durationSeconds: 12,
      audioSizeBytes: 48_000,
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(requests[0].init.body), {
      url: "https://example.supabase.co/storage/v1/object/sign/scribe-audio/a.webm?token=abc",
    });
    assert.match(result.text, /Hello/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Deepgram retries once with ≤500ms backoff then succeeds", async () => {
  const attempts = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    attempts.push(Date.now());
    if (attempts.length === 1) {
      return jsonResponse({ err_msg: "unavailable" }, 503);
    }
    return jsonResponse(DG_RESULT);
  };
  try {
    const provider = new DeepgramProvider("test-deepgram-key");
    const result = await provider.transcribe({
      audioUrl: "https://signed.example/a.webm",
      language: "english",
      sessionId: "sess-retry",
    });
    assert.equal(attempts.length, DEEPGRAM_MAX_RETRIES + 1);
    assert.ok(attempts[1] - attempts[0] >= DEEPGRAM_RETRY_BACKOFF_MS - 20);
    assert.match(result.text, /Hello/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Deepgram timeout does not retry", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    return new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  };
  try {
    const provider = new DeepgramProvider("test-deepgram-key");
    await assert.rejects(
      () => provider.transcribe({
        audioUrl: "https://signed.example/a.webm",
        language: "english",
        sessionId: "sess-timeout",
        timeoutMs: 20,
      }),
      (err) => err.code === "DEEPGRAM_TIMEOUT",
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
