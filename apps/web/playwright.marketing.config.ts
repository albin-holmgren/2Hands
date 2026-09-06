import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.MARKETING_PORT ?? "4321");
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("MARKETING_PORT must be a valid TCP port");
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e-marketing",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  outputDir: "test-results-marketing",
  reporter: [["list"], ["html", { outputFolder: "playwright-report-marketing", open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", reducedMotion: "reduce" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    { name: "narrow", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: `pnpm --filter @rakazo/www exec astro preview --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
    // Keep Astro's preview subprocess attached so Playwright owns its lifetime.
    env: { ASTRO_PREVIEW_BACKGROUND: "1", RAKAZO_IGNORE_ENV_FILES: "1" },
  },
});
