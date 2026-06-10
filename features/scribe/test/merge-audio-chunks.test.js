import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeAudioChunkBlobs,
  resolveChunkMimeType,
} from "../lib/merge-audio-chunks.js";

test("mergeAudioChunkBlobs returns single blob unchanged", () => {
  const one = new Blob(["a"], { type: "audio/webm" });
  assert.equal(mergeAudioChunkBlobs([one]), one);
});

test("mergeAudioChunkBlobs combines multiple blobs", () => {
  const merged = mergeAudioChunkBlobs(
    [new Blob(["a"]), new Blob(["b"])],
    "audio/webm;codecs=opus",
  );
  assert.equal(merged.type, "audio/webm");
  assert.equal(merged.size, 2);
});

test("resolveChunkMimeType prefers chunk mime_type", () => {
  assert.equal(
    resolveChunkMimeType([{ mime_type: "audio/mp4", storage_path: "0.webm" }]),
    "audio/mp4",
  );
});

test("resolveChunkMimeType falls back to storage extension", () => {
  assert.equal(
    resolveChunkMimeType([{ storage_path: "prefix/0.m4a" }]),
    "audio/mp4",
  );
});
