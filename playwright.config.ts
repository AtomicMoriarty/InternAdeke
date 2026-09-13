import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration.
 * Docs: https://playwright.dev/docs/test-configuration
 *
 * Setup:
 *   npm i -D @playwright/test
 *   npx playwright install --with-deps chromium
 *
 * Run all E2E tests:
 *   npx playwright test
 *
 * Run only card/modal tests:
 *   npx playwright test src/tests/e2e/cardModal.test.ts
 *
 * View HTML report:
 *   npx playwright show-report
 */
export default defineConfig({
  testDir: "./src/tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    /* Base URL – `vite dev` default */
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],

  /* Start the dev server automatically before running tests */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
