/**
 * Chooses what the Conversation panel renders.
 *
 * A non-empty transcript always wins — including while SOAP is generating
 * or the session is in review. The "Session in progress" / empty placeholder
 * is only for an open session that has no transcript yet.
 *
 * @param {{
 *   segments?: unknown[];
 *   loading?: boolean;
 *   sessionStatus?: string | null;
 * }} input
 * @returns {{
 *   branch: "transcript" | "loading" | "placeholder";
 *   hasTranscript: boolean;
 *   transcriptLength: number;
 *   sessionStatus: string | null;
 * }}
 */
/**
 * While recording, follow the newest turn. After stop, leave the transcript
 * pinned at the first turn so later updates do not jump the pane.
 *
 * @param {boolean} isLiveRecording
 * @returns {"latest" | "start"}
 */
export function resolveConversationScrollTarget(isLiveRecording) {
  return isLiveRecording ? "latest" : "start";
}

export function resolveConversationChatView({
  segments = [],
  loading = false,
  sessionStatus = null,
} = {}) {
  const transcriptLength = Array.isArray(segments) ? segments.length : 0;
  const hasTranscript = transcriptLength > 0;
  const branch = hasTranscript ? "transcript" : loading ? "loading" : "placeholder";
  return {
    branch,
    hasTranscript,
    transcriptLength,
    sessionStatus: sessionStatus ?? null,
  };
}

/**
 * Display segments: show text as soon as any source has it.
 * Prefer the source with more distinct speaker labels so background
 * batch diarization can relabel without waiting for a workspace reload.
 *
 * @param {{
 *   workspaceSegments?: unknown[];
 *   optimisticSegments?: unknown[];
 *   liveSegments?: unknown[];
 * }} input
 */
export function resolveDisplayTranscriptSegments({
  workspaceSegments = [],
  optimisticSegments = [],
  liveSegments = [],
} = {}) {
  const candidates = [workspaceSegments, optimisticSegments, liveSegments].filter(
    (rows) => Array.isArray(rows) && rows.length > 0,
  );
  if (!candidates.length) return [];
  return candidates.reduce((best, next) =>
    countSpeakerLabels(next) > countSpeakerLabels(best) ? next : best,
  );
}

function countSpeakerLabels(segments) {
  return new Set(
    (segments ?? [])
      .map((segment) => segment?.speaker_label)
      .filter((label) => label && label !== "Unknown"),
  ).size;
}
