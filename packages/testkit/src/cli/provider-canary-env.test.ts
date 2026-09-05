import { describe, expect, it } from "vitest";
import {
  canaryDatabaseUrl,
  canaryProvider,
  providerCanaryEnv,
  sandboxCanaryRequest,
} from "./provider-canary-env.js";

describe("live provider canary isolation", () => {
  it("discards inherited storage, billing, signup locks, and unrelated live services", () => {
    const env = providerCanaryEnv(
      {
        DATABASE_URL: "postgres://private.invalid/live",
        REALTIME_DATABASE_URL: "postgres://private.invalid/live",
        E2B_API_KEY: "fake-e2b",
        OPENROUTER_API_KEY: "fake-model",
        BOX_API_KEY: "fake-box",
        COMPOSIO_API_KEY: "fake-composio",
        SMTP_URL: "smtp://private.invalid",
        SIGNUPS_LOCKED: "true",
        BILLING_ENABLED: "true",
      },
      "e2b",
    );
    expect(env).toMatchObject({
      RAKAZO_IGNORE_ENV_FILES: "1",
      VERIFY_PROVIDERS: "1",
      DATABASE_URL: undefined,
      REALTIME_DATABASE_URL: undefined,
      E2B_API_KEY: "fake-e2b",
      OPENROUTER_API_KEY: undefined,
      BOX_API_KEY: undefined,
      COMPOSIO_API_KEY: "",
      SMTP_URL: "",
      SIGNUPS_LOCKED: "false",
      BILLING_ENABLED: "false",
    });
  });

  it("accepts only an explicit loopback disposable database", () => {
    expect(canaryDatabaseUrl({ DATABASE_URL: "postgres://private.invalid/live" })).toBeUndefined();
    expect(() =>
      canaryDatabaseUrl({ TEST_DATABASE_URL: "postgres://private.invalid/live_test" }),
    ).toThrow("loopback");
    const url = canaryDatabaseUrl({
      TEST_DATABASE_URL: "postgres://test:test@127.0.0.1:55439/canary_test",
    });
    expect(providerCanaryEnv({}, "openrouter", url).REALTIME_DATABASE_URL).toBe(url);
  });

  it("requires a known provider and caps sandbox lifetime at three minutes", () => {
    expect(canaryProvider(["--provider=e2b"])).toBe("e2b");
    expect(() => canaryProvider(["--provider=typo"])).toThrow("--provider");
    const now = Date.parse("2026-09-05T00:00:00Z");
    expect(Date.parse(sandboxCanaryRequest(now).expiresAt) - now).toBe(180_000);
  });
});
