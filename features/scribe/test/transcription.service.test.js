import test from "node:test";
import assert from "node:assert/strict";
import { TranscriptionService } from "../services/transcription.service.js";
import { SESSION_STATUS, TRANSCRIPTION_STATUS } from "../constants.js";
import { DatabaseError } from "../errors.js";
import { mockAuditService, mockCtx } from "./helpers/mocks.js";
import { isInlineTranscriptionJob } from "../lib/transcription-jobs.js";

function mockProvider() {
  return { name: "mock", model: "test", transcribe: async () => ({ segments: [] }) };
}

test("queueSession uses inline job when enqueue fails", async () => {
  const session = {
    id: "sess-1",
    doctor_id: "doctor-1",
    clinic_id: "clinic-1",
    status: SESSION_STATUS.UPLOADED,
    language: "english",
  };

  let current = { ...session };
  const sessions = {
    findById: async () => ({ ...current }),
    transitionStatus: async (_id, _doc, from, to) => {
      current = { ...current, status: to };
      assert.equal(from, SESSION_STATUS.UPLOADED);
      return { ...current };
    },
  };

  const transcriptions = {
    findBySession: async () => null,
    upsertTranscription: async (row) => ({ id: "tx-1", ...row }),
    enqueue: async () => {
      throw new DatabaseError("enqueueTranscription", { code: "42501" });
    },
  };

  const svc = new TranscriptionService(
    {},
    sessions,
    transcriptions,
    mockAuditService(),
    mockProvider(),
  );

  const result = await svc.queueSession("sess-1", {}, mockCtx());

  assert.equal(result.queued, true);
  assert.ok(isInlineTranscriptionJob(result.job));
  assert.equal(result.session.status, SESSION_STATUS.TRANSCRIPTION_QUEUED);
  assert.equal(result.transcription.status, TRANSCRIPTION_STATUS.QUEUED);
});

test("queueSession is idempotent when already queued", async () => {
  const session = {
    id: "sess-1",
    doctor_id: "doctor-1",
    status: SESSION_STATUS.TRANSCRIPTION_QUEUED,
  };
  const sessions = { findById: async () => session };
  const transcriptions = {
    findBySession: async () => ({ id: "tx-1" }),
    enqueue: async () => { throw new Error("should not enqueue"); },
  };

  const svc = new TranscriptionService({}, sessions, transcriptions, mockAuditService(), mockProvider());
  const result = await svc.queueSession("sess-1", {}, mockCtx());

  assert.equal(result.queued, false);
  assert.equal(result.reason, "already_queued_or_processing");
});

test("completeFromLiveResult persists streamed transcript without the batch provider", async () => {
  const session = {
    id: "sess-live",
    doctor_id: "doctor-1",
    clinic_id: "clinic-1",
    status: SESSION_STATUS.UPLOADED,
    language: "english",
  };
  let current = { ...session };
  const sessions = {
    findById: async () => ({ ...current }),
    findByIdForWorker: async () => ({ ...current }),
    transitionStatus: async (_id, _doc, from, to) => {
      current = { ...current, status: to };
      return { ...current };
    },
  };
  const stored = { transcription: null, segments: null };
  const transcriptions = {
    findBySession: async () => stored.transcription,
    upsertTranscription: async (row) => {
      stored.transcription = { id: "tx-live", ...row };
      return stored.transcription;
    },
    replaceSegments: async (_tid, _sid, segs) => {
      stored.segments = segs;
    },
  };
  const provider = {
    name: "deepgram",
    model: "nova-2-medical",
    transcribe: async () => {
      throw new Error("batch provider must not run for live complete");
    },
  };
  const svc = new TranscriptionService({}, sessions, transcriptions, mockAuditService(), provider);
  const result = await svc.completeFromLiveResult(
    "sess-live",
    {
      text: "Hello patient how are you",
      language: "en",
      model: "nova-2-medical",
      durationSeconds: 8,
      segments: [
        {
          start: 0,
          end: 2.1,
          text: "Hello patient how are you",
          speaker: "A",
          speaker_label: "Doctor",
          confidence: 0.94,
        },
      ],
    },
    mockCtx(),
  );

  assert.equal(result.session.status, SESSION_STATUS.TRANSCRIBED);
  assert.equal(stored.transcription.status, TRANSCRIPTION_STATUS.COMPLETED);
  assert.equal(stored.segments.length, 1);
  assert.equal(stored.segments[0].text, "Hello patient how are you");
});

test("runForSession refineSpeakers relabels without changing session status", async () => {
  const session = {
    id: "sess-refine",
    doctor_id: "doctor-1",
    clinic_id: "clinic-1",
    status: SESSION_STATUS.SOAP_REVIEWING,
    language: "english",
  };
  const stored = { transcription: { id: "tx-1", status: TRANSCRIPTION_STATUS.COMPLETED, attempt_count: 1 }, segments: [] };
  const sessions = {
    findById: async () => ({ ...session }),
  };
  const transcriptions = {
    findBySession: async () => stored.transcription,
    upsertTranscription: async (row) => {
      stored.transcription = { ...stored.transcription, ...row };
      return stored.transcription;
    },
    replaceSegments: async (_tid, _sid, segs) => {
      stored.segments = segs;
    },
  };
  const svc = new TranscriptionService(
    {},
    sessions,
    transcriptions,
    mockAuditService(),
    mockProvider(),
  );
  svc._transcribeSessionAudio = async () => ({
    text: "Hello. I have a fever.",
    model: "nova-2-medical",
    language: "en",
    segments: [
      { index: 0, start: 0, end: 1, text: "Hello.", speaker: "A", speaker_label: "Doctor", confidence: 0.9, is_low_confidence: false },
      { index: 1, start: 1, end: 2, text: "I have a fever.", speaker: "B", speaker_label: "Patient", confidence: 0.9, is_low_confidence: false },
    ],
    speakerMap: { A: "Doctor", B: "Patient" },
    lowConfidenceSegments: [],
    averageConfidence: 0.9,
    confidenceSummary: {},
    providerResponse: {},
    costCents: 1,
    chunkCount: 1,
  });

  const result = await svc.runForSession("sess-refine", mockCtx(), { refineSpeakers: true });

  assert.equal(result.result.status, "speakers_refined");
  assert.equal(result.session.status, SESSION_STATUS.SOAP_REVIEWING);
  assert.equal(stored.segments.length, 2);
  assert.equal(stored.segments[1].speaker_label, "Patient");
  assert.equal(stored.transcription.provider_response.source, "batch_refine");
});

test("_transcribeSessionAudio sends Deepgram a signed URL and does not download bytes", async () => {
  const session = {
    id: "sess-url",
    doctor_id: "doctor-1",
    clinic_id: "clinic-1",
    status: SESSION_STATUS.TRANSCRIBING,
    language: "english",
    audio_size_bytes: 24_000,
    audio_duration_seconds: 18,
  };
  let downloaded = false;
  const seen = { audioUrl: null };
  const sessions = {
    findById: async () => session,
    getConfirmedChunks: async () => [
      { storage_path: "clinic/doc/sess-url/chunks/0000.webm", mime_type: "audio/webm;codecs=opus" },
    ],
  };
  const provider = {
    name: "deepgram",
    model: "nova-2-medical",
    transcribe: async (input) => {
      seen.audioUrl = input.audioUrl;
      assert.equal(input.audioBlobs, undefined);
      return {
        text: "hello",
        model: "nova-2-medical",
        segments: [],
        speakerMap: {},
        lowConfidenceSegments: [],
        averageConfidence: 0.9,
      };
    },
  };
  const svc = new TranscriptionService(
    {
      storage: {
        from: () => ({
          createSignedUrl: async () => ({
            data: { signedUrl: "https://signed.example/audio.webm" },
            error: null,
          }),
          download: async () => {
            downloaded = true;
            return { data: null, error: new Error("should not download") };
          },
        }),
      },
    },
    sessions,
    {},
    mockAuditService(),
    provider,
  );

  const result = await svc._transcribeSessionAudio(session);
  assert.equal(seen.audioUrl, "https://signed.example/audio.webm");
  assert.equal(downloaded, false);
  assert.equal(result.chunkCount, 1);
});

test("runForSession without refine still short-circuits already transcribed sessions", async () => {
  const session = {
    id: "sess-done",
    doctor_id: "doctor-1",
    status: SESSION_STATUS.TRANSCRIBED,
  };
  const svc = new TranscriptionService(
    {},
    { findById: async () => session },
    {},
    mockAuditService(),
    mockProvider(),
  );
  const result = await svc.runForSession("sess-done", mockCtx());
  assert.equal(result.result.status, "already_transcribed");
});
