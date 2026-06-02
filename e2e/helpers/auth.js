// @ts-check
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AUTH_STATE_PATH = "e2e/.auth/doctor.json";

/**
 * @returns {boolean}
 */
export function hasE2ECredentials() {
  return Boolean(
    process.env.E2E_TEST_EMAIL &&
    process.env.E2E_TEST_PASSWORD &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * @returns {boolean}
 */
export function hasE2EAIKeys() {
  return Boolean(
    process.env.DEEPGRAM_API_KEY &&
    (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
  );
}

/**
 * Password grant against Supabase Auth (test users must use email/password provider).
 * @returns {Promise<{ accessToken: string; refreshToken: string; cookieHeader: string }|null>}
 */
export async function signInWithPassword(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!supabaseUrl || !anonKey || !email || !password) return null;

  const res = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    data: { email, password },
  });

  if (!res.ok()) return null;

  const body = await res.json();
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const payload = encodeURIComponent(
    JSON.stringify({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      token_type: "bearer",
      expires_in: body.expires_in,
      expires_at: body.expires_at,
      user: body.user,
    }),
  );

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    cookieHeader: `${cookieName}=${payload}`,
  };
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 */
export async function createAuthenticatedApiContext(playwright, request) {
  const auth = await signInWithPassword(request);
  if (!auth) return null;

  return playwright.request.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    extraHTTPHeaders: { Cookie: auth.cookieHeader },
  });
}

/**
 * Persists Playwright storage state for UI tests (cookie-based Supabase session).
 * @param {import('@playwright/test').Page} page
 */
export async function saveDoctorStorageState(page) {
  const auth = await signInWithPassword(page.request);
  if (!auth) throw new Error("E2E sign-in failed — check E2E_TEST_EMAIL / E2E_TEST_PASSWORD");

  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
  const eq = auth.cookieHeader.indexOf("=");
  const cookieName = auth.cookieHeader.slice(0, eq);
  const cookieValue = auth.cookieHeader.slice(eq + 1);

  await page.context().addCookies([
    {
      name: cookieName,
      value: cookieValue,
      url: baseURL,
      httpOnly: false,
      secure: baseURL.startsWith("https"),
      sameSite: "Lax",
    },
  ]);

  await mkdir(dirname(AUTH_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: AUTH_STATE_PATH });
}

export { AUTH_STATE_PATH };
