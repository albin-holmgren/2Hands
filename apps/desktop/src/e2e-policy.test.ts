import { describe, expect, it } from "vitest";
import { assertElectronE2EOptIn, hiddenElectronTest } from "./e2e-policy.js";

describe("visible Electron journey opt-in", () => {
  it.each([{}, { CI: "true" }, { RAKAZO_ELECTRON_E2E: "true" }])(
    "does not launch windows through an ordinary test invocation",
    (environment) => {
      expect(() => assertElectronE2EOptIn(environment)).toThrow("open and close visible");
    },
  );
  it("allows an explicitly opted-in run", () => {
    expect(() => assertElectronE2EOptIn({ RAKAZO_ELECTRON_E2E: "1" })).not.toThrow();
  });
});

describe("hidden packaged verification", () => {
  it("requires explicit opt-in and an isolated absolute profile", () => {
    expect(hiddenElectronTest({})).toBe(false);
    expect(() => hiddenElectronTest({ RAKAZO_ELECTRON_HIDDEN: "1" })).toThrow();
    const env = { RAKAZO_ELECTRON_HIDDEN: "1", RAKAZO_ELECTRON_E2E: "1" };
    expect(() => hiddenElectronTest(env)).toThrow("isolated");
    expect(() =>
      hiddenElectronTest({ ...env, RAKAZO_PERFORMANCE_USER_DATA: "relative" }),
    ).toThrow();
    expect(hiddenElectronTest({ ...env, RAKAZO_PERFORMANCE_USER_DATA: "/tmp/desktop-test" })).toBe(
      true,
    );
  });
});
