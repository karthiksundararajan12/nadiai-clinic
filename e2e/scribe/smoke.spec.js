// @ts-check
import { test, expect } from "@playwright/test";

const authConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http") &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

test.describe("Scribe — unauthenticated smoke @smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  });

  test("protected routes redirect to login when auth is configured", async ({ browser }) => {
    test.skip(!authConfigured, "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set");
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/scribe");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await context.close();
  });

  test("history route redirects to login when auth is configured", async ({ browser }) => {
    test.skip(!authConfigured, "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set");
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/scribe/history");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await context.close();
  });
});

test.describe("Scribe — API smoke @smoke", () => {
  test("scribe APIs reject unauthenticated requests when auth is configured", async ({ request }) => {
    test.skip(!authConfigured, "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set");

    const endpoints = [
      { method: "GET", path: "/api/scribe/sessions/00000000-0000-0000-0000-000000000001/review" },
      { method: "GET", path: "/api/scribe/consultations/history?bucket=active" },
      {
        method: "POST",
        path: "/api/scribe/sessions/00000000-0000-0000-0000-000000000001/transcription/run",
        data: {},
      },
    ];

    for (const ep of endpoints) {
      const res =
        ep.method === "GET"
          ? await request.get(ep.path)
          : await request.post(ep.path, { data: ep.data ?? {} });
      expect([401, 403]).toContain(res.status());
    }
  });
});
