import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveConversationChatView,
  resolveDisplayTranscriptSegments,
} from "./conversation-chat-view.js";

const SEGMENTS = [
  { id: "s1", speaker_label: "Doctor", text: "How long have you had the fever?" },
  { id: "s2", speaker_label: "Patient", text: "About three days now." },
];

test("transcript branch wins while SOAP is generating", () => {
  const view = resolveConversationChatView({
    segments: SEGMENTS,
    loading: true,
    sessionStatus: "GENERATING_SOAP",
  });
  assert.equal(view.branch, "transcript");
  assert.equal(view.hasTranscript, true);
  assert.equal(view.transcriptLength, 2);
  assert.equal(view.sessionStatus, "GENERATING_SOAP");
});

test("transcript branch wins while session is in SOAP review", () => {
  const view = resolveConversationChatView({
    segments: SEGMENTS,
    loading: false,
    sessionStatus: "SOAP_REVIEWING",
  });
  assert.equal(view.branch, "transcript");
  assert.equal(view.transcriptLength, 2);
});

test("placeholder only when transcript is empty and not loading", () => {
  const view = resolveConversationChatView({
    segments: [],
    loading: false,
    sessionStatus: "SOAP_REVIEWING",
  });
  assert.equal(view.branch, "placeholder");
  assert.equal(view.hasTranscript, false);
  assert.equal(view.transcriptLength, 0);
});

test("loading branch only when transcript is still empty", () => {
  const view = resolveConversationChatView({
    segments: [],
    loading: true,
    sessionStatus: "TRANSCRIBING",
  });
  assert.equal(view.branch, "loading");
});

test("resolveDisplayTranscriptSegments prefers more distinct speakers", () => {
  const live = [{ id: "1", speaker_label: "Doctor", text: "Hello" }];
  const refined = [
    { id: "1", speaker_label: "Doctor", text: "Hello" },
    { id: "2", speaker_label: "Patient", text: "Hi" },
  ];
  const shown = resolveDisplayTranscriptSegments({
    workspaceSegments: live,
    optimisticSegments: refined,
    liveSegments: live,
  });
  assert.equal(shown, refined);
});

test("resolveDisplayTranscriptSegments falls back to live when workspace is empty", () => {
  const live = [{ id: "1", speaker_label: "Doctor", text: "Hello" }];
  const shown = resolveDisplayTranscriptSegments({
    workspaceSegments: [],
    optimisticSegments: [],
    liveSegments: live,
  });
  assert.equal(shown, live);
});
