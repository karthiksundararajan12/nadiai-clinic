/**
 * Deepgram Live Streaming client (wss://api.deepgram.com/v1/listen).
 * Server-only — API key never leaves the Node process.
 */

import WebSocket from "ws";
import { TranscriptionProviderError } from "../../errors.js";
import { createLogger } from "../../logger.js";
import {
  DEEPGRAM_LISTEN_WS_URL,
  resolveDeepgramLanguage,
  resolveDeepgramModel,
} from "./deepgram-config.js";

const log = createLogger({ component: "DeepgramLiveClient" });

const KEEPALIVE_MS = 8_000;
const CLOSE_WAIT_MS = 8_000;

export class DeepgramLiveClient {
  /**
   * @param {string} [apiKey]
   */
  constructor(apiKey) {
    this._apiKey = apiKey ?? process.env.DEEPGRAM_API_KEY;
    if (!this._apiKey) {
      throw new TranscriptionProviderError("DEEPGRAM_API_KEY is not configured");
    }
    /** @type {import('ws')|null} */
    this._ws = null;
    this._keepAliveTimer = null;
    this._closed = false;
  }

  /**
   * @param {{
   *   language: string;
   *   mimeType?: string;
   *   onResult: (message: object) => void;
   *   onError: (err: Error) => void;
   *   onClose: () => void;
   * }} opts
   */
  connect(opts) {
    const { language, onResult, onError, onClose } = opts;
    const model = resolveDeepgramModel(language);
    const deepgramLang = resolveDeepgramLanguage(language);

    const params = new URLSearchParams({
      model,
      language: deepgramLang,
      smart_format: "true",
      punctuate: "true",
      interim_results: "true",
      diarize: "true",
      diarize_model: "latest",
      endpointing: "300",
    });

    const url = `${DEEPGRAM_LISTEN_WS_URL}?${params}`;
    this._model = model;
    this._language = language;

    log.info("Opening Deepgram live socket", { model, language: deepgramLang });

    this._ws = new WebSocket(url, {
      headers: { Authorization: `Token ${this._apiKey}` },
    });

    this._ws.on("open", () => {
      this._keepAliveTimer = setInterval(() => {
        this.sendKeepAlive();
      }, KEEPALIVE_MS);
    });

    this._ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      const text = typeof data === "string" ? data : data.toString("utf8");
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      if (parsed.type === "Error") {
        onError(
          new TranscriptionProviderError(
            parsed.description || parsed.message || "Deepgram live error",
          ),
        );
        return;
      }
      onResult(parsed);
    });

    this._ws.on("error", (err) => {
      onError(
        err instanceof Error ? err : new Error(String(err?.message ?? err)),
      );
    });

    this._ws.on("close", () => {
      this._clearKeepAlive();
      if (!this._closed) onClose();
    });

    return new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onFail = (err) => {
        cleanup();
        reject(err instanceof Error ? err : new Error("Deepgram live connection failed"));
      };
      const cleanup = () => {
        this._ws?.off("open", onOpen);
        this._ws?.off("error", onFail);
      };
      this._ws.once("open", onOpen);
      this._ws.once("error", onFail);
    });
  }

  /** @param {Buffer|Uint8Array|ArrayBuffer} chunk */
  sendAudio(chunk) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    this._ws.send(chunk);
    return true;
  }

  sendKeepAlive() {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    this._ws.send(JSON.stringify({ type: "KeepAlive" }));
  }

  /**
   * Asks Deepgram to finalize remaining audio, then closes the socket.
   * @returns {Promise<void>}
   */
  closeStream() {
    this._closed = true;
    this._clearKeepAlive();
    return new Promise((resolve) => {
      if (!this._ws || this._ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        this._forceClose();
        resolve();
      }, CLOSE_WAIT_MS);

      this._ws.once("close", () => {
        clearTimeout(timer);
        resolve();
      });

      try {
        if (this._ws.readyState === WebSocket.OPEN) {
          this._ws.send(JSON.stringify({ type: "CloseStream" }));
        } else {
          this._forceClose();
        }
      } catch {
        this._forceClose();
        clearTimeout(timer);
        resolve();
      }
    });
  }

  abort() {
    this._closed = true;
    this._clearKeepAlive();
    this._forceClose();
  }

  get model() {
    return this._model ?? resolveDeepgramModel();
  }

  _clearKeepAlive() {
    if (this._keepAliveTimer) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = null;
    }
  }

  _forceClose() {
    try {
      this._ws?.terminate();
    } catch {
      /* already closed */
    }
    this._ws = null;
  }
}
