import { runProcess } from "./process.js";
import { stripeCanaryConfig } from "./stripe-canary-config.js";

async function main() {
  // Deliberately do not load .env: a release check must not inherit production credentials.
  const config = stripeCanaryConfig(process.env);
  if (process.argv.includes("--preflight")) {
    console.log(
      "Stripe preflight passed: explicit test key and disposable loopback database. No network requests made.",
    );
    return;
  }
  const env = {
    ...process.env,
    RAKAZO_IGNORE_ENV_FILES: "1",
    DATABASE_URL: config.databaseUrl,
    STRIPE_SECRET_KEY: config.secretKey,
    STRIPE_WEBHOOK_SECRET: "",
    STRIPE_PRICE_PLUS: "",
    STRIPE_PRICE_PRO: "",
    STRIPE_PRICE_ULTRA: "",
    BILLING_ENABLED: "true",
    VERIFY_DATABASE: "1",
    VERIFY_PROVIDERS: "",
    STRIPE_TEST_RENEWAL_ONLY: process.argv.includes("--renewal-only") ? "1" : "",
  };
  await runProcess("pnpm", ["--filter", "@rakazo/db", "exec", "prisma", "migrate", "deploy"], env);
  await runProcess(
    "pnpm",
    ["exec", "vitest", "run", "--maxWorkers=1", "apps/api/src/stripe-billing.canary.test.ts"],
    env,
  );
}

main().catch((error) => {
  // Preflight/process failures contain no Stripe request objects or credential values.
  console.error(error instanceof Error ? error.message : "Stripe release check failed");
  process.exitCode = 1;
});
