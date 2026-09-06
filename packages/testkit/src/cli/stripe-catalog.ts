import { createStripeClient } from "../../../../apps/api/src/stripe-billing.js";
import { inspectStripeTestCatalog } from "./stripe-catalog-check.js";

async function main() {
  // Never read .env, the application's Stripe key or its live price identifiers.
  const key = process.env.STRIPE_TEST_SECRET_KEY?.trim();
  if (!key || !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key))
    throw new Error("STRIPE_TEST_SECRET_KEY must be a dedicated sandbox secret key.");
  const price = (plan: string) => {
    const value = process.env[`STRIPE_TEST_PRICE_${plan}`]?.trim();
    if (!value || !/^price_[A-Za-z0-9]+$/.test(value))
      throw new Error(`STRIPE_TEST_PRICE_${plan} must identify the sandbox plan price.`);
    return value;
  };
  const prices = { plus: price("PLUS"), pro: price("PRO"), ultra: price("ULTRA") };
  const id = process.env.STRIPE_TEST_WEBHOOK_ENDPOINT_ID?.trim();
  const url = process.env.STRIPE_TEST_WEBHOOK_URL?.trim();
  if (!id || !/^we_[A-Za-z0-9]+$/.test(id) || !url || new URL(url).protocol !== "https:")
    throw new Error(
      "Supply STRIPE_TEST_WEBHOOK_ENDPOINT_ID and its expected STRIPE_TEST_WEBHOOK_URL (HTTPS).",
    );
  const report = await inspectStripeTestCatalog(createStripeClient(key)!, prices, {
    id,
    url,
  }).catch(() => {
    throw new Error("Sandbox catalog could not be read; check its key, prices and permissions.");
  });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Stripe catalog verification failed.");
  process.exitCode = 1;
});
