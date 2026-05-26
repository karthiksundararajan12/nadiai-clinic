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
  const noop = () => ({ data: null, error: null });
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
      signInWithOAuth: noop,
      signOut: () => Promise.resolve(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => query(),
  };
}
