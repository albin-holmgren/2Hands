import { PLANS } from "@rakazo/core";
import type { createStripeClient } from "../../../../apps/api/src/stripe-billing.js";

type StripeClient = NonNullable<ReturnType<typeof createStripeClient>>;
const plans = ["plus", "pro", "ultra"] as const;
type PaidPlan = (typeof plans)[number];

/** Only GET requests; no customers, sessions, products, prices or portal settings are created. */
export async function inspectStripeTestCatalog(
  stripe: Pick<StripeClient, "balance" | "prices" | "billingPortal" | "webhookEndpoints">,
  priceIds: Record<PaidPlan, string>,
  destination: { id: string; url: string },
) {
  const checks: Array<{ id: string; passed: boolean }> = [];
  const check = (id: string, passed: boolean) => checks.push({ id, passed });
  const balance = await stripe.balance.retrieve();
  if (balance.livemode !== false) throw new Error("A dedicated Stripe sandbox is required.");
  check("distinct-plan-prices", new Set(Object.values(priceIds)).size === plans.length);
  const prices = await Promise.all(
    plans.map((plan) => stripe.prices.retrieve(priceIds[plan], { expand: ["product"] })),
  );
  for (const [index, plan] of plans.entries()) {
    const price = prices[index]!;
    const product = typeof price.product === "object" ? price.product : undefined;
    check(
      `${plan}-price`,
      price.id === priceIds[plan] &&
        price.livemode === false &&
        price.active &&
        price.currency === "usd" &&
        price.unit_amount === PLANS[plan].priceUsd * 100 &&
        price.type === "recurring" &&
        price.recurring?.interval === "month" &&
        price.recurring.interval_count === 1 &&
        price.recurring.usage_type === "licensed" &&
        price.billing_scheme === "per_unit" &&
        price.transform_quantity === null,
    );
    check(
      `${plan}-product`,
      Boolean(product && !product.deleted && product.active && product.livemode === false),
    );
  }
  // The product creates portal sessions without a configuration override, so its default matters.
  const configurations = await stripe.billingPortal.configurations.list({
    active: true,
    is_default: true,
    limit: 2,
    expand: ["data.features.subscription_update.products"],
  });
  const portal = configurations.data[0];
  check(
    "default-test-portal",
    configurations.data.length === 1 &&
      !configurations.has_more &&
      Boolean(portal?.active && portal.is_default && portal.livemode === false),
  );
  const features = portal?.features;
  check("payment-method-update", features?.payment_method_update.enabled === true);
  check("invoice-history", features?.invoice_history.enabled === true);
  check(
    "cancel-at-period-end",
    features?.subscription_cancel.enabled === true &&
      features.subscription_cancel.mode === "at_period_end" &&
      features.subscription_cancel.proration_behavior === "none",
  );
  const updates = features?.subscription_update;
  check("plan-changes-managed-at-renewal", updates?.enabled === false);
  const endpoint = await stripe.webhookEndpoints.retrieve(destination.id);
  check(
    "webhook-destination",
    endpoint.livemode === false &&
      endpoint.status === "enabled" &&
      endpoint.url === destination.url,
  );
  check(
    "webhook-billing-events",
    [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
    ].every(
      (event) => endpoint.enabled_events.includes(event) || endpoint.enabled_events.includes("*"),
    ),
  );
  return { ok: checks.every((entry) => entry.passed), scope: "Stripe test catalog", checks };
}
