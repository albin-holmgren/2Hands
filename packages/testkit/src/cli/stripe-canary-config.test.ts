import { describe, expect, it } from "vitest";
import { stripeCanaryConfig } from "./stripe-canary-config.js";

const fixture = {
  VERIFY_STRIPE_TEST_MODE: "1",
  STRIPE_TEST_SECRET_KEY: "sk_test_example",
  TEST_DATABASE_URL: "postgres://test:test@127.0.0.1:55439/stripe_canary_test",
};

describe("Stripe release gate preflight", () => {
  it("accepts only explicitly authorized test credentials and local test data", () => {
    expect(stripeCanaryConfig(fixture).databaseUrl).toContain("stripe_canary_test");
    expect(() => stripeCanaryConfig({ ...fixture, VERIFY_STRIPE_TEST_MODE: "0" })).toThrow(
      /authorize/,
    );
  });

  it.each(["sk_live_example", "rk_live_example", "pk_test_example", "", undefined])(
    "rejects non-test secret credentials without revealing them",
    (key) => {
      expect(() => stripeCanaryConfig({ ...fixture, STRIPE_TEST_SECRET_KEY: key })).toThrow(
        "STRIPE_TEST_SECRET_KEY must be a Stripe sandbox/test-mode secret key.",
      );
    },
  );

  it("never uses a regular application secret or database as a fallback", () => {
    expect(() =>
      stripeCanaryConfig({
        VERIFY_STRIPE_TEST_MODE: "1",
        STRIPE_SECRET_KEY: "sk_live_example",
        DATABASE_URL: "postgres://example.invalid/production",
      }),
    ).toThrow(/STRIPE_TEST_SECRET_KEY/);
  });

  it.each([
    undefined,
    "postgres://test:test@db.example.test/stripe_test",
    "postgres://test:test@127.0.0.1/production",
    "postgres://test:test@127.0.0.1/stripe_test?host=db.example.test",
  ])("refuses missing, remote or non-test databases", (url) => {
    expect(() => stripeCanaryConfig({ ...fixture, TEST_DATABASE_URL: url })).toThrow();
  });
});
