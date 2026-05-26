"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useUser() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          const { data } = await supabase
            .from("doctor_profiles")
            .select("*")
            .eq("user_id", session.user.id)
            .single();
          setProfile(data);
        }
      } catch {
        // Supabase not configured
      } finally {
        setLoading(false);
      }
    };

    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "TOKEN_REFRESHED" && session?.user) {
          setUser(session.user);
        }
        if (event === "SIGNED_OUT") {
          setUser(null);
          setProfile(null);
          window.location.href = "/login";
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const displayName = profile?.full_name
    || user?.user_metadata?.full_name
    || user?.email?.split("@")[0]
    || "Doctor";

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return {
    user,
    profile,
    loading,
    displayName,
    initials,
    specialization: profile?.specialization || "",
  };
}
