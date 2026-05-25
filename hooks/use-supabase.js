"use client";

import { useMemo } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useSupabase() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  return supabase;
}
