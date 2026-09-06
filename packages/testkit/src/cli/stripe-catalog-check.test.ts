import { describe, expect, it, vi } from "vitest";
import { createStripeClient } from "../../../../apps/api/src/stripe-billing.js";
import { inspectStripeTestCatalog } from "./stripe-catalog-check.js";

function fixture() {
  const stripe = createStripeClient("sk_test_synthetic")!;
  const ids = { plus: "price_plus", pro: "price_pro", ultra: "price_ultra" };
  const prices = [2000, 6000, 20000].map((amount, index) => ({
    id: Object.values(ids)[index]!,
    active: true,
    livemode: false,
    currency: "usd",
    unit_amount: amount,
    type: "recurring",
    billing_scheme: "per_unit",
    transform_quantity: null,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    product: { id: `prod_${index}`, active: true, livemode: false },
  }));
  const portal = {
    active: true,
    livemode: false,
    is_default: true,
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
      subscription_update: {
        enabled: false,
        default_allowed_updates: ["price"],
        products: prices.map((price) => ({ product: price.product.id, prices: [price.id] })),
      },
    },
  };
  const destination = {
    id: "we_synthetic",
    url: "https://staging.example.test/api/stripe/webhook",
  };
  const endpoint = {
    livemode: false,
    status: "enabled",
    url: destination.url,
    enabled_events: [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
    ],
  };
  vi.spyOn(stripe.webhookEndpoints, "retrieve").mockResolvedValue(endpoint as never);
  const balance = vi
    .spyOn(stripe.balance, "retrieve")
    .mockResolvedValue({ livemode: false } as never);
  vi.spyOn(stripe.prices, "retrieve").mockImplementation(
    async (id) => prices.find((price) => price.id === id) as never,
  );
  const configurations = vi.spyOn(stripe.billingPortal.configurations, "list").mockResolvedValue({
    data: [portal],
    has_more: false,
  } as never);
  return { stripe, ids, prices, portal, balance, configurations, destination, endpoint };
}

describe("read-only Stripe sandbox catalog check", () => {
  it("checks the three monthly prices and the portal actually used by the app", async () => {
    const { stripe, ids, configurations, destination } = fixture();
    expect(await inspectStripeTestCatalog(stripe, ids, destination)).toMatchObject({ ok: true });
    expect(configurations).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, is_default: true }),
    );
  });

  it("stops on a live-mode account before reading its catalog", async () => {
    const { stripe, ids, balance, destination } = fixture();
    balance.mockResolvedValue({ livemode: true } as never);
    await expect(inspectStripeTestCatalog(stripe, ids, destination)).rejects.toThrow("sandbox");
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
  });

  it.each(["amount", "currency", "interval", "inactive", "live", "product"])(
    "rejects a mismatched %s price/product",
    async (field) => {
      const { stripe, ids, prices, destination } = fixture();
      const price = prices[0]!;
      if (field === "amount") price.unit_amount = 2001;
      if (field === "currency") price.currency = "eur";
      if (field === "interval") price.recurring.interval = "year";
      if (field === "inactive") price.active = false;
      if (field === "live") price.livemode = true;
      if (field === "product") price.product.active = false;
      expect((await inspectStripeTestCatalog(stripe, ids, destination)).ok).toBe(false);
    },
  );

  it.each(["missing", "immediate-cancel", "unsafe-price-switch", "cancel-proration"])(
    "rejects an unusable default portal (%s)",
    async (field) => {
      const { stripe, ids, portal, configurations, destination } = fixture();
      if (field === "missing")
        configurations.mockResolvedValue({ data: [], has_more: false } as never);
      if (field === "immediate-cancel") portal.features.subscription_cancel.mode = "immediately";
      if (field === "unsafe-price-switch") portal.features.subscription_update.enabled = true;
      if (field === "cancel-proration")
        portal.features.subscription_cancel.proration_behavior = "create_prorations";
      expect((await inspectStripeTestCatalog(stripe, ids, destination)).ok).toBe(false);
    },
  );
  it.each(["wrong-url", "disabled", "live", "missing-invoice-event"])(
    "rejects a misconfigured webhook (%s)",
    async (kind) => {
      const { stripe, ids, endpoint, destination } = fixture();
      if (kind === "wrong-url") endpoint.url = "https://wrong.example.test/webhook";
      if (kind === "disabled") endpoint.status = "disabled";
      if (kind === "live") endpoint.livemode = true;
      if (kind === "missing-invoice-event") endpoint.enabled_events.pop();
      expect((await inspectStripeTestCatalog(stripe, ids, destination)).ok).toBe(false);
    },
  );
});
