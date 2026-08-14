import { createBrowserClient } from "@supabase/ssr";

let client;

export function getSupabaseBrowserClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || !url.startsWith("http")) {
    return createPlaceholderClient();
  }

  client = createBrowserClient(url, key);
  return client;
}

function createPlaceholderClient() {
  const query = () => ({
    select: () => query(),
    eq: () => query(),
    single: () => Promise.resolve({ data: null, error: null }),
    upsert: () => query(),
  });

  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      // Must return an error (not a bare success noop) so UI loading states
      // can reset when Supabase env vars are missing/misconfigured.
      signInWithOAuth: async () => ({
        data: { provider: null, url: null },
        error: new Error("Supabase is not configured"),
      }),
      signOut: () => Promise.resolve(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => query(),
  };
}
