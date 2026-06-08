"use client";

export async function fetchAudioPlaybackManifest(sessionId) {
  const res = await fetch(`/api/scribe/sessions/${sessionId}/audio`);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Audio playback unavailable (${res.status})`);
  }
  return payload;
}

/**
 * Merges signed chunk URLs into a single object URL for HTML5 audio seek.
 * @param {{ chunks: Array<{ url: string; mime_type?: string }>; mime_type?: string }} manifest
 */
export async function buildMergedAudioUrl(manifest) {
  const chunks = manifest?.chunks ?? [];
  if (!chunks.length) throw new Error("No audio chunks in manifest");

  const blobs = await Promise.all(
    chunks.map(async (chunk) => {
      const res = await fetch(chunk.url);
      if (!res.ok) throw new Error("Failed to load audio chunk");
      return res.blob();
    }),
  );

  const mime = manifest.mime_type ?? chunks[0]?.mime_type ?? "audio/webm";
  return URL.createObjectURL(new Blob(blobs, { type: mime }));
}
