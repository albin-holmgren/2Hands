import { testDatabaseUrl } from "./test-database-url.js";

/** Never fall back to the application's Stripe key or database. */
export function stripeCanaryConfig(env: NodeJS.ProcessEnv) {
  if (env.VERIFY_STRIPE_TEST_MODE !== "1")
    throw new Error("Set VERIFY_STRIPE_TEST_MODE=1 to authorize disposable Stripe test objects.");
  const secretKey = env.STRIPE_TEST_SECRET_KEY?.trim();
  if (!secretKey || !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(secretKey))
    throw new Error("STRIPE_TEST_SECRET_KEY must be a Stripe sandbox/test-mode secret key.");
  const databaseUrl = testDatabaseUrl(env.TEST_DATABASE_URL);
  if (!databaseUrl)
    throw new Error("TEST_DATABASE_URL must name a disposable loopback _test database.");
  return { secretKey, databaseUrl };
}
