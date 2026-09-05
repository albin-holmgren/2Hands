import { defineConfig } from "@playwright/test";
import { assertElectronE2EOptIn } from "../src/e2e-policy.js";

assertElectronE2EOptIn(process.env);

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
