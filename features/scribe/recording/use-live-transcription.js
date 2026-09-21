"use client";

/**
 * Streams MediaRecorder chunks over a WebSocket to the scribe live-transcription
 * relay. Reconnects once on drop; after that, marks fallback so the caller can
 * use the existing batch Deepgram API when recording stops.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LIVE_TRANSCRIPTION } from "../constants.js";

function liveSocketUrl(language) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ language: language || "english" });
  return `${proto}//${window.location.host}${LIVE_TRANSCRIPTION.PATH}?${params}`;
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
  const completeWaiterRef = useRef(/** @type {((v: unknown) => void)|null} */ (null));
  const mimeTypeRef = useRef("");
  const fallbackRef = useRef(false);
  const lastResultRef = useRef(/** @type {object|null} */ (null));

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

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
      ws.send(
        JSON.stringify({
          type: "start",
          language: languageRef.current,
          mimeType: mimeTypeRef.current,
        }),
      );
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "ready") {
        flushQueue();
        return;
      }
      if (msg.type === "transcript" && Array.isArray(msg.segments)) {
        setSegments(msg.segments);
        if (msg.full_text) {
          lastResultRef.current = {
            text: msg.full_text,
            language: languageRef.current,
            segments: msg.segments.filter((s) => !s.is_interim),
            speakerMap: {},
            providerResponse: { source: "live" },
          };
        }
        return;
      }
      if (msg.type === "complete") {
        lastResultRef.current = msg.result ?? lastResultRef.current;
        completeWaiterRef.current?.(msg.result ?? lastResultRef.current);
        completeWaiterRef.current = null;
        return;
      }
      if (msg.type === "error") {
        if (msg.fallback) {
          fallbackRef.current = true;
          setFallback(true);
          setStatus("fallback");
        }
      }
    };

    ws.onerror = () => {
      /* onclose handles reconnect / fallback */
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (intentionalCloseRef.current) {
        setStatus("closed");
        completeWaiterRef.current?.(lastResultRef.current);
        completeWaiterRef.current = null;
        return;
      }
      if (!reconnectUsedRef.current) {
        reconnectUsedRef.current = true;
        setStatus("reconnecting");
        const next = new WebSocket(liveSocketUrl(languageRef.current));
        next.binaryType = "arraybuffer";
        wsRef.current = next;
        attachSocketHandlers(next);
        return;
      }
      fallbackRef.current = true;
      setFallback(true);
      setStatus("fallback");
      completeWaiterRef.current?.(null);
      completeWaiterRef.current = null;
    };
  }, [flushQueue]);

  const connect = useCallback(
    (mimeType = "") => {
      if (typeof window === "undefined") return;
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;
      mimeTypeRef.current = mimeType;
      intentionalCloseRef.current = false;
      reconnectUsedRef.current = false;
      fallbackRef.current = false;
      lastResultRef.current = null;
      setFallback(false);
      outboundQueueRef.current = [];
      setSegments([]);
      setStatus("connecting");

      try {
        const ws = new WebSocket(liveSocketUrl(languageRef.current));
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;
        attachSocketHandlers(ws);
      } catch {
        fallbackRef.current = true;
        setFallback(true);
        setStatus("fallback");
      }
    },
    [attachSocketHandlers],
  );

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
      ws.send(JSON.stringify({ type: "stop" }));
    });
  }, []);

  const reset = useCallback(() => {
    intentionalCloseRef.current = true;
    try { wsRef.current?.close(); } catch { /* ignore */ }
    wsRef.current = null;
    outboundQueueRef.current = [];
    reconnectUsedRef.current = false;
    lastResultRef.current = null;
    fallbackRef.current = false;
    setSegments([]);
    setStatus("idle");
    setFallback(false);
  }, []);

  useEffect(() => () => {
    intentionalCloseRef.current = true;
    try { wsRef.current?.close(); } catch { /* ignore */ }
  }, []);

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
