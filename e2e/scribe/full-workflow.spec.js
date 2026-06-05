// @ts-check
/**
 * End-to-end: full AI Scribe clinical pipeline (8 steps).
 */
import { test, expect } from "@playwright/test";
import {
  createAuthenticatedApiContext,
  hasE2EAIKeys,
  hasE2ECredentials,
} from "../helpers/auth.js";
import { createScribeApi } from "../helpers/scribe-api.js";

test.describe("AI Scribe — full clinical pipeline @full", () => {
  test.describe.configure({ mode: "serial", timeout: 10 * 60 * 1000 });

  test.beforeAll(() => {
    test.skip(!hasE2ECredentials(), "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD");
    test.skip(!hasE2EAIKeys(), "Set DEEPGRAM_API_KEY and GEMINI_API_KEY (or OPENAI_API_KEY)");
  });

  test.beforeEach(async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());
  });

  /** @param {import('@playwright/test').Page} page @param {string} sessionId */
  function sessionRow(page, sessionId) {
    return page.locator(`[data-session-id="${sessionId}"]`);
  }

  test("consultation → upload → transcribe → SOAP → prescription approval", async ({
    page,
    playwright,
  }) => {
    const apiContext = await createAuthenticatedApiContext(playwright, page.request);
    test.skip(!apiContext, "Could not sign in test doctor (email/password required)");

    const api = createScribeApi(apiContext);

    // 1. New consultation + 2. Audio upload
    const sessionId = await api.createConsultationWithAudio();
    let session = await api.getSession(sessionId);
    expect(session.status).toBe("UPLOADED");

    await page.goto("/scribe");
    await expect(page.getByTestId("scribe-workflow")).toBeVisible();

    // 3. Transcription
    session = await api.runTranscriptionUntil(sessionId, "TRANSCRIBED");
    expect(session.status).toBe("TRANSCRIBED");

    await page.getByRole("button", { name: "Past consultations" }).click();
    await page.getByTestId("consultations-refresh").click();
    const row = sessionRow(page, sessionId);
    await expect(row).toBeVisible({ timeout: 30_000 });

    // 4. Transcript review (UI) + complete
    await row.getByTestId("review-transcript").click();
    await expect(page.getByTestId("transcript-review-workspace")).toBeVisible();
    await expect(page.getByTestId("scribe-complete-review")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("scribe-complete-review").click();
    await api.waitForSessionStatus(sessionId, ["REVIEW_COMPLETED"], 90_000);

    // 5. SOAP generation (split view — right panel)
    await expect(page.getByTestId("scribe-generate-soap")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("scribe-generate-soap").click();
    await expect(page.getByTestId("soap-review-workspace")).toBeVisible({ timeout: 180_000 });
    const soap = await api.getSoapReview(sessionId);
    expect(soap.note).toBeTruthy();

    // 6–7. SOAP review + approval (UI)
    await page.getByTestId("soap-approve").click();
    await api.waitForSessionStatus(sessionId, ["SOAP_APPROVED", "COMPLETED"], 90_000);

    // 8. Prescription generation + review + approval
    await page.getByTestId("prescription-refresh").click();

    const rxRow = page.locator(`[data-testid="prescription-row"][data-session-id="${sessionId}"]`);
    await expect(rxRow).toBeVisible({ timeout: 60_000 });
    await rxRow.getByTestId("prescription-generate").click();
    await api.waitForSessionStatus(
      sessionId,
      ["PRESCRIPTION_DRAFT_READY", "PRESCRIPTION_REVIEW_REQUIRED", "PRESCRIPTION_REVIEWING"],
      180_000,
    );

    await rxRow.getByTestId("prescription-review-open").click();
    await expect(page.getByTestId("prescription-review-workspace")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("prescription-approve").click();

    await api.waitForSessionStatus(sessionId, ["PRESCRIPTION_APPROVED", "COMPLETED"], 90_000);

    const archived = (await api.listConsultations("history")).find((r) => r.id === sessionId);
    expect(archived).toBeTruthy();

    await apiContext.dispose();
  });
});
