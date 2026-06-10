/**
 * MediaRecorder timeslice chunks are not valid standalone WebM/MP4 files.
 * Concatenating raw bytes corrupts the container; browser-style Blob merge
 * matches what HTML5 playback uses and produces a file Deepgram can decode.
 */

/** @type {Record<string, string>} */
const EXTENSION_MIME = {
  webm: "audio/webm",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  aac: "audio/aac",
};

/**
 * @param {Blob[]} blobs
 * @param {string} [mimeType]
 * @returns {Blob}
 */
export function mergeAudioChunkBlobs(blobs, mimeType = "audio/webm") {
  if (!blobs?.length) {
    throw new Error("mergeAudioChunkBlobs: no blobs provided");
  }
  if (blobs.length === 1) return blobs[0];

  const type = String(mimeType || blobs[0]?.type || "audio/webm")
    .split(";")[0]
    .trim() || "audio/webm";

  return new Blob(blobs, { type });
}

/**
 * @param {Array<{ mime_type?: string|null; storage_path?: string }>} chunks
 * @returns {string}
 */
export function resolveChunkMimeType(chunks) {
  const fromRow = chunks.find((chunk) => chunk.mime_type)?.mime_type;
  if (fromRow) return fromRow;

  const path = chunks[0]?.storage_path ?? "";
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return EXTENSION_MIME[ext] ?? "audio/webm";
}
