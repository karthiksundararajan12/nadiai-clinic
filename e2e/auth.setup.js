// @ts-check
import { test as setup } from "@playwright/test";
import { hasE2ECredentials, saveDoctorStorageState } from "./helpers/auth.js";

setup("authenticate test doctor", async ({ page }) => {
  setup.skip(!hasE2ECredentials(), "E2E credentials not configured");

  await page.goto("/dashboard");
  await saveDoctorStorageState(page);
});
