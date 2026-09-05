import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-marketing",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  outputDir: "test-results-marketing",
  reporter: [["list"], ["html", { outputFolder: "playwright-report-marketing", open: "never" }]],
  use: { baseURL: "http://127.0.0.1:4321", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    { name: "narrow", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: "pnpm --filter @rakazo/www exec astro preview --host 127.0.0.1",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: false,
    timeout: 30_000,
    // Keep Astro's preview subprocess attached so Playwright owns its lifetime.
    env: { ASTRO_PREVIEW_BACKGROUND: "1", RAKAZO_IGNORE_ENV_FILES: "1" },
  },
});
