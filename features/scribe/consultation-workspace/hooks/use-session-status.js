"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchSessionStatus } from "../services/scribe-export.client.js";
import { capStatusPollIntervalMs } from "../../lib/transcription-budget.js";

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
 * Session status via Supabase Realtime, with a ≤2s HTTP fallback.
 */
export function useSessionStatus(sessionId, { enabled = true, intervalMs = 2_000 } = {}) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const pollMs = capStatusPollIntervalMs(intervalMs);

  const applySession = useCallback((raw) => {
    const next = raw?.session ?? raw;
    if (!mountedRef.current) return next ?? null;
    setSession(next?.id || next?.status ? next : null);
    setError(null);
    return next ?? null;
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionId || !enabled) return null;
    try {
      const data = await fetchSessionStatus(sessionId);
      return applySession(data);
    } catch (err) {
      if (mountedRef.current) setError(err);
      return null;
    }
  }, [sessionId, enabled, applySession]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!sessionId || !enabled) return undefined;
    queueMicrotask(() => refresh());
    const timer = setInterval(refresh, pollMs);
    return () => clearInterval(timer);
  }, [sessionId, enabled, pollMs, refresh]);

  useEffect(() => {
    if (!sessionId || !enabled) return undefined;
    const supabase = getSupabaseBrowserClient();
    if (typeof supabase.channel !== "function") return undefined;

    const channel = supabase
      .channel(`scribe-session-status-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scribe_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload?.new;
          if (row?.status || row?.id) applySession(row);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel?.(channel);
    };
  }, [sessionId, enabled, applySession]);

  const isTranscribed = TRANSCRIBED.has(session?.status);
  const isFailed = TERMINAL_FAILURE.has(session?.status);
  const isProcessing = enabled && sessionId && !isTranscribed && !isFailed && session?.status;

  return { session, error, refresh, isTranscribed, isFailed, isProcessing };
}
