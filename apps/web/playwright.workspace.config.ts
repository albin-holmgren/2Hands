import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "workspace-offline.spec.ts",
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "../../playwright-report/workspace", open: "never" }],
  ],
  outputDir: "../../test-results/workspace",
  use: { baseURL: "http://127.0.0.1:5193", trace: "retain-on-failure" },
  projects: [{ name: "workspace-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec vite --port 5193",
    url: "http://127.0.0.1:5193",
    reuseExistingServer: false,
    env: {
      RAKAZO_IGNORE_ENV_FILES: "1",
      SCREEN_PROXY_SECRET: "offline-screen-fixture-secret-with-more-than-32-characters",
      API_PROXY_TARGET: "http://127.0.0.1:1",
    },
  },
});
