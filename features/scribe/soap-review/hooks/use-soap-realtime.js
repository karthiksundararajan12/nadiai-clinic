"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useSOAPRealtime(sessionId, onChange) {
  useEffect(() => {
    if (!sessionId) return;

    const supabase = getSupabaseBrowserClient();
    if (typeof supabase.channel !== "function") return;

    const channel = supabase
      .channel(`scribe-soap-review-${sessionId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "soap_notes",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => onChange?.({ table: "soap_notes", payload }))
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "soap_note_versions",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => onChange?.({ table: "soap_note_versions", payload }))
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "soap_note_edits",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => onChange?.({ table: "soap_note_edits", payload }))
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "scribe_sessions",
        filter: `id=eq.${sessionId}`,
      }, (payload) => onChange?.({ table: "scribe_sessions", payload }))
      .subscribe();

    return () => {
      supabase.removeChannel?.(channel);
    };
  }, [sessionId, onChange]);
}
