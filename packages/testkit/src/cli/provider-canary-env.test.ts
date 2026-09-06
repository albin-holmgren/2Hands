import { describe, expect, it } from "vitest";
import {
  canaryDatabaseUrl,
  canaryProvider,
  computerCanaryEnv,
  computerCanaryModel,
  providerCanaryEnv,
  sandboxCanaryRequest,
} from "./provider-canary-env.js";

describe("live provider canary isolation", () => {
  it("runs the computer journey with only its explicitly selected model key and hosted allowance", () => {
    const source = {
      E2B_API_KEY: "synthetic-e2b",
      COMPUTER_E2E_PROVIDER: "vercel-gateway",
      COMPUTER_E2E_MODEL: "openai/gpt-4.1-mini",
      AI_GATEWAY_API_KEY: "synthetic-gateway",
      OPENROUTER_API_KEY: "unrelated-model",
      VERCEL_OIDC_TOKEN: "unrelated-oidc",
      STRIPE_SECRET_KEY: "unrelated-payment",
      STRIPE_WEBHOOK_SECRET: "unrelated-webhook",
      STRIPE_TEST_SECRET_KEY: "unrelated-test-payment",
      SANDBOX_IDLE_MS: "999999",
    };
    const env = computerCanaryEnv(source, "postgres://test:test@127.0.0.1/computer_test");
    expect(env).toMatchObject({
      AI_GATEWAY_API_KEY: "synthetic-gateway",
      OPENROUTER_API_KEY: undefined,
      VERCEL_OIDC_TOKEN: undefined,
      PI_DEFAULT_PROVIDER: "vercel-gateway",
      PI_DEFAULT_MODEL: "openai/gpt-4.1-mini",
      BILLING_ENABLED: "true",
      SANDBOX_IDLE_MS: "180000",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      STRIPE_TEST_SECRET_KEY: "",
    });
    expect(computerCanaryModel(env)).toEqual({
      provider: "vercel-gateway",
      model: "openai/gpt-4.1-mini",
      key: "synthetic-gateway",
    });
    expect(
      computerCanaryModel({ ...source, VERCEL_AI_GATEWAY_API_KEY: "canonical-gateway" }).key,
    ).toBe("canonical-gateway");
    expect(() => computerCanaryModel({ ...source, AI_GATEWAY_API_KEY: "" })).toThrow(
      "AI_GATEWAY_API_KEY",
    );
    expect(() => computerCanaryModel({ ...source, COMPUTER_E2E_PROVIDER: "typo" })).toThrow(
      "COMPUTER_E2E_PROVIDER",
    );
    expect(
      computerCanaryModel({
        COMPUTER_E2E_MODEL: "synthetic-vision-model",
        OPENROUTER_API_KEY: "synthetic-openrouter",
      }),
    ).toEqual({
      provider: "openrouter",
      model: "synthetic-vision-model",
      key: "synthetic-openrouter",
    });
  });

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
