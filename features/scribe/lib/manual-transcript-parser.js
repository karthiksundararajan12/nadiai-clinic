/**
 * @fileoverview Parses pasted doctor–patient text into normalized transcript segments.
 */

const SPEAKER_PREFIX = /^(Doctor|Patient|Attendant)\s*:\s*(.+)$/i;

/** @param {string} raw */
function capitalizeSpeaker(raw) {
  const lower = raw.toLowerCase();
  if (lower === "doctor") return "Doctor";
  if (lower === "patient") return "Patient";
  return "Attendant";
}

/** @param {"Doctor"|"Patient"|"Attendant"} label */
function labelToSpeakerKey(label) {
  if (label === "Doctor") return "A";
  if (label === "Patient") return "B";
  if (label === "Attendant") return "C";
  return "B";
}

/**
 * @param {string} text
 * @returns {{ segments: Array<Record<string, unknown>>; fullText: string }}
 */
export function parseManualTranscript(text) {
  const fullText = text.trim();
  if (!fullText) return { segments: [], fullText: "" };

  const lines = fullText.includes("\n")
    ? fullText.split(/\n+/).map((line) => line.trim()).filter(Boolean)
    : [fullText];

  let alternateSpeaker = "Patient";
  let time = 0;
  const segments = [];

  for (const line of lines) {
    const match = line.match(SPEAKER_PREFIX);
    let speakerLabel;
    let content;

    if (match) {
      speakerLabel = capitalizeSpeaker(match[1]);
      content = match[2].trim();
    } else {
      speakerLabel = alternateSpeaker;
      content = line;
      alternateSpeaker = alternateSpeaker === "Patient" ? "Doctor" : "Patient";
    }

    if (!content) continue;

    const duration = Math.max(2, content.length * 0.06);
    segments.push({
      segment_index: segments.length,
      start_seconds: time,
      end_seconds: time + duration,
      text: content,
      speaker: labelToSpeakerKey(speakerLabel),
      speaker_label: speakerLabel,
      confidence: 1,
      is_low_confidence: false,
    });
    time += duration;
  }

  return { segments, fullText };
}
