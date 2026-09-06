import path from "node:path";

/** Electron tests open real application windows even when Playwright is headless. */
export function assertElectronE2EOptIn(environment: Record<string, string | undefined>): void {
  if (environment.RAKAZO_ELECTRON_E2E === "1") return;
  throw new Error(
    "Electron E2E tests open and close visible desktop windows. " +
      "Run only with explicit user approval, then set RAKAZO_ELECTRON_E2E=1. " +
      "Use the desktop check and unit-test commands for non-interactive verification.",
  );
}

/** Hidden verification must never reuse the person's installed profile. */
export function hiddenElectronTest(environment: Record<string, string | undefined>): boolean {
  if (environment.RAKAZO_ELECTRON_HIDDEN !== "1") return false;
  assertElectronE2EOptIn(environment);
  const profile = environment.RAKAZO_PERFORMANCE_USER_DATA;
  if (!profile || !path.isAbsolute(profile)) {
    throw new Error("Hidden Electron verification requires an absolute isolated user-data path.");
  }
  return true;
}
