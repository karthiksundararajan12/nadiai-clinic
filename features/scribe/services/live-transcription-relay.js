/**
 * Relays a browser WebSocket to Deepgram Live Streaming.
 */

import { createLiveTranscriptAccumulator } from "../lib/live-transcript-accumulator.js";
import { DeepgramLiveClient } from "./transcription-providers/deepgram-live.client.js";
import { createLogger } from "../logger.js";

const log = createLogger({ component: "LiveTranscriptionRelay" });

/**
 * @param {import('ws')} clientSocket
 * @param {{ language?: string }} [query]
 */
export function attachLiveTranscriptionRelay(clientSocket, query = {}) {
  const accumulator = createLiveTranscriptAccumulator();
  let deepgram = null;
  let language = query.language || "english";
  let started = false;
  let finishing = false;
  /** @type {Buffer[]} */
  const pendingAudio = [];

  const sendJson = (payload) => {
    if (clientSocket.readyState === 1) {
      clientSocket.send(JSON.stringify(payload));
    }
  };

  const openDeepgram = async () => {
    deepgram = new DeepgramLiveClient();
    await deepgram.connect({
      language,
      onResult: (message) => {
        const snap = accumulator.applyResult(message);
        if (message.type === "Results") {
          sendJson({
            type: "transcript",
            is_final: Boolean(message.is_final),
            speech_final: Boolean(message.speech_final),
            text: snap.interimText || snap.text,
            segments: snap.segments,
            full_text: snap.text,
          });
        }
      },
      onError: (err) => {
        log.error("Deepgram live error", { error: err.message });
        sendJson({ type: "error", message: err.message, fallback: true });
      },
      onClose: () => {
        if (!finishing) {
          sendJson({ type: "upstream_closed" });
        }
      },
    });
    started = true;
    for (const chunk of pendingAudio) {
      deepgram.sendAudio(chunk);
    }
    pendingAudio.length = 0;
    sendJson({ type: "ready", model: deepgram.model });
  };

  clientSocket.on("message", (data, isBinary) => {
    if (isBinary) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (started && deepgram) deepgram.sendAudio(buf);
      else pendingAudio.push(buf);
      return;
    }

    const text = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
    if (!text.startsWith("{")) {
      const buf = Buffer.from(data);
      if (started && deepgram) deepgram.sendAudio(buf);
      else pendingAudio.push(buf);
      return;
    }

    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    if (msg.type === "start") {
      language = msg.language || language;
      void openDeepgram().catch((err) => {
        sendJson({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
          fallback: true,
        });
      });
      return;
    }

    if (msg.type === "keepalive") {
      deepgram?.sendKeepAlive();
      return;
    }

    if (msg.type === "stop") {
      void finish();
    }
  });

  clientSocket.on("close", () => {
    if (!finishing) deepgram?.abort();
  });

  async function finish() {
    if (finishing) return;
    finishing = true;
    try {
      await deepgram?.closeStream();
    } catch (err) {
      log.warn("Deepgram CloseStream failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    const result = accumulator.toTranscriptionResult({
      language,
      model: deepgram?.model,
    });
    sendJson({ type: "complete", result });
    try {
      clientSocket.close();
    } catch {
      /* already closing */
    }
  }
}
