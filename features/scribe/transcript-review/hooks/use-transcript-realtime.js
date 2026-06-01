"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useTranscriptRealtime(sessionId, onChange) {
  useEffect(() => {
    if (!sessionId) return;

    const supabase = getSupabaseBrowserClient();
    if (typeof supabase.channel !== "function") return;

    const channel = supabase
      .channel(`scribe-transcript-review-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transcription_segments",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => onChange?.({ table: "transcription_segments", payload }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transcript_versions",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => onChange?.({ table: "transcript_versions", payload }),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "scribe_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => onChange?.({ table: "scribe_sessions", payload }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel?.(channel);
    };
  }, [sessionId, onChange]);
}
