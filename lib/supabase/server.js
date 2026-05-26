import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || !url.startsWith("http")) {
    return createPlaceholderServerClient();
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component — cookies can only be modified in
          // Server Actions or Route Handlers.
        }
      },
    },
  });
}

function createPlaceholderServerClient() {
  const query = () => ({
    select: () => query(),
    eq: () => query(),
    single: () => Promise.resolve({ data: null, error: null }),
  });

  return {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: null }, error: null }),
      getSession: () =>
        Promise.resolve({ data: { session: null }, error: null }),
      exchangeCodeForSession: () =>
        Promise.resolve({ data: null, error: { message: "Not configured" } }),
    },
    from: () => query(),
  };
}
