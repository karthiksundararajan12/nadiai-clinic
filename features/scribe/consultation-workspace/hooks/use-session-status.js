"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSessionStatus } from "../services/scribe-export.client.js";

const TERMINAL_FAILURE = new Set(["TRANSCRIPTION_FAILED", "FAILED"]);
const TRANSCRIBED = new Set([
  "TRANSCRIBED",
  "REVIEWING",
  "REVIEW_COMPLETED",
  "GENERATING_SOAP",
  "SOAP_READY",
  "SOAP_REVIEW_REQUIRED",
  "SOAP_REVIEWING",
]);

/**
 * Polls session status while background processing runs.
 */
export function useSessionStatus(sessionId, { enabled = true, intervalMs = 2000 } = {}) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!sessionId || !enabled) return null;
    try {
      const data = await fetchSessionStatus(sessionId);
      const session = data?.session ?? data;
      if (mountedRef.current) {
        setSession(session?.id || session?.status ? session : null);
        setError(null);
      }
      return session;
    } catch (err) {
      if (mountedRef.current) setError(err);
      return null;
    }
  }, [sessionId, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!sessionId || !enabled) return undefined;
    queueMicrotask(() => refresh());
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [sessionId, enabled, intervalMs, refresh]);

  const isTranscribed = TRANSCRIBED.has(session?.status);
  const isFailed = TERMINAL_FAILURE.has(session?.status);
  const isProcessing = enabled && sessionId && !isTranscribed && !isFailed && session?.status;

  return { session, error, refresh, isTranscribed, isFailed, isProcessing };
}
