"use client";

/**
 * Streams MediaRecorder chunks over a WebSocket straight to Deepgram Live.
 * Each connection fetches a new 30-second grant. Reconnects once on drop;
 * after that, marks fallback so the caller can use batch transcription.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LIVE_TRANSCRIPTION } from "../constants.js";
import { createLiveTranscriptAccumulator } from "../lib/live-transcript-accumulator.js";
import {
  deepgramBrowserProtocols,
  deepgramListenUrl,
} from "./deepgram-browser-socket.js";

const KEEPALIVE_MS = 8_000;

async function fetchLiveToken() {
  const res = await fetch(LIVE_TRANSCRIPTION.TOKEN_PATH, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || typeof payload.access_token !== "string" || !payload.access_token) {
    throw new Error(payload?.error || "Live transcription token failed");
  }
  return payload.access_token;
}

/**
 * @param {{ language: string }} options
 */
export function useLiveTranscription({ language }) {
  const [segments, setSegments] = useState(/** @type {unknown[]} */ ([]));
  const [status, setStatus] = useState("idle");
  const [fallback, setFallback] = useState(false);

  const wsRef = useRef(/** @type {WebSocket|null} */ (null));
  const outboundQueueRef = useRef(/** @type {ArrayBuffer[]} */ ([]));
  const reconnectUsedRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const languageRef = useRef(language);
  const modelRef = useRef("");
  const completeWaiterRef = useRef(/** @type {((v: unknown) => void)|null} */ (null));
  const fallbackRef = useRef(false);
  const lastResultRef = useRef(/** @type {object|null} */ (null));
  const accumulatorRef = useRef(createLiveTranscriptAccumulator());
  const keepAliveRef = useRef(/** @type {ReturnType<typeof setInterval>|null} */ (null));
  const connectGenerationRef = useRef(0);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const clearKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const markFallback = useCallback(() => {
    fallbackRef.current = true;
    setFallback(true);
    setStatus("fallback");
    completeWaiterRef.current?.(null);
    completeWaiterRef.current = null;
  }, []);

  const publishSnapshot = useCallback(() => {
    const snap = accumulatorRef.current.snapshot();
    setSegments(snap.segments);
    lastResultRef.current = accumulatorRef.current.toTranscriptionResult({
      language: languageRef.current,
      model: modelRef.current,
    });
  }, []);

  const flushQueue = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (outboundQueueRef.current.length) {
      const chunk = outboundQueueRef.current.shift();
      if (chunk) ws.send(chunk);
    }
  }, []);

  const attachSocketHandlers = useCallback((ws) => {
    ws.onopen = () => {
      setStatus("live");
      keepAliveRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, KEEPALIVE_MS);
      flushQueue();
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "Error") {
        markFallback();
        try { ws.close(); } catch { /* ignore */ }
        return;
      }

      if (msg.type === "Results") {
        accumulatorRef.current.applyResult(msg);
        publishSnapshot();
      }
    };

    ws.onerror = () => {
      /* onclose handles reconnect / fallback */
    };

    ws.onclose = () => {
      clearKeepAlive();
      if (wsRef.current === ws) wsRef.current = null;
      if (fallbackRef.current) return;
      if (intentionalCloseRef.current) {
        publishSnapshot();
        setStatus("closed");
        completeWaiterRef.current?.(lastResultRef.current);
        completeWaiterRef.current = null;
        return;
      }
      if (!reconnectUsedRef.current) {
        reconnectUsedRef.current = true;
        setStatus("reconnecting");
        void openSocket();
        return;
      }
      markFallback();
    };
  }, [clearKeepAlive, flushQueue, markFallback, publishSnapshot]);

  const openSocket = useCallback(async () => {
    const generation = ++connectGenerationRef.current;
    const { url, model } = deepgramListenUrl(languageRef.current);
    modelRef.current = model;
    let token;
    try {
      token = await fetchLiveToken();
    } catch {
      if (generation !== connectGenerationRef.current) return;
      markFallback();
      return;
    }
    if (generation !== connectGenerationRef.current || intentionalCloseRef.current) return;

    try {
      const ws = new WebSocket(url, deepgramBrowserProtocols(token));
      token = "";
      if (generation !== connectGenerationRef.current) {
        ws.close();
        return;
      }
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      attachSocketHandlers(ws);
    } catch {
      markFallback();
    }
  }, [attachSocketHandlers, markFallback]);

  const connect = useCallback((_mimeType = "") => {
    if (typeof window === "undefined") return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;
    intentionalCloseRef.current = false;
    reconnectUsedRef.current = false;
    fallbackRef.current = false;
    lastResultRef.current = null;
    accumulatorRef.current = createLiveTranscriptAccumulator();
    setFallback(false);
    outboundQueueRef.current = [];
    setSegments([]);
    setStatus("connecting");
    void openSocket();
  }, [openSocket]);

  const sendAudio = useCallback(async (blob) => {
    if (fallbackRef.current || !blob?.size) return;
    const buffer = await blob.arrayBuffer();
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(buffer);
      return;
    }
    outboundQueueRef.current.push(buffer);
  }, []);

  /**
   * @returns {Promise<object|null>} Live TranscriptionResult, or null to use batch.
   */
  const finish = useCallback(() => {
    if (fallbackRef.current) return Promise.resolve(null);

    const usable = (result) => (result?.text ? result : null);

    return new Promise((resolve) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        resolve(usable(lastResultRef.current));
        return;
      }

      const timer = setTimeout(() => {
        intentionalCloseRef.current = true;
        try { ws.close(); } catch { /* ignore */ }
        resolve(usable(lastResultRef.current));
      }, 10_000);

      completeWaiterRef.current = (result) => {
        clearTimeout(timer);
        resolve(usable(result || lastResultRef.current));
      };

      intentionalCloseRef.current = true;
      try {
        ws.send(JSON.stringify({ type: "CloseStream" }));
      } catch {
        clearTimeout(timer);
        resolve(usable(lastResultRef.current));
      }
    });
  }, []);

  const reset = useCallback(() => {
    intentionalCloseRef.current = true;
    connectGenerationRef.current += 1;
    clearKeepAlive();
    try { wsRef.current?.close(); } catch { /* ignore */ }
    wsRef.current = null;
    outboundQueueRef.current = [];
    reconnectUsedRef.current = false;
    lastResultRef.current = null;
    fallbackRef.current = false;
    accumulatorRef.current = createLiveTranscriptAccumulator();
    setSegments([]);
    setStatus("idle");
    setFallback(false);
  }, [clearKeepAlive]);

  useEffect(() => () => {
    intentionalCloseRef.current = true;
    connectGenerationRef.current += 1;
    clearKeepAlive();
    try { wsRef.current?.close(); } catch { /* ignore */ }
  }, [clearKeepAlive]);

  return useMemo(
    () => ({
      segments,
      status,
      fallback,
      connect,
      sendAudio,
      finish,
      reset,
    }),
    [segments, status, fallback, connect, sendAudio, finish, reset],
  );
}
