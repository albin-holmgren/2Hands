import type { PrismaClient } from "@rakazo/db";
import { Hono } from "hono";
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyStripeSubscription } from "./stripe-billing.js";
import { mountStripeWebhook, processStripeBillingEvent } from "./stripe-webhook.js";

vi.mock("./stripe-billing.js", async (original) => ({
  ...(await original<typeof import("./stripe-billing.js")>()),
  applyStripeSubscription: vi.fn(async () => "applied"),
}));
const event = {
  id: "evt-example",
  type: "checkout.session.completed",
  created: 1_783_152_000,
  data: {
    object: {
      id: "checkout-example",
      customer: "cus-example",
      subscription: "sub-example",
      status: "complete",
      metadata: { organizationId: "untrusted-other-org" },
    },
  },
} as unknown as Stripe.Event;

function fixture() {
  const stripe = new Stripe("sk_test_example");
  const retrieve = vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue({
    id: "sub-example",
    customer: "cus-example",
    status: "active",
    latest_invoice: {
      id: "in-example",
      status: "paid",
      subscription: "sub-example",
      lines: {
        data: [
          {
            subscription_item: "si-example",
            proration: false,
            price: { id: "price-plus" },
            period: { start: 1_783_123_200, end: 1_785_801_600 },
          },
        ],
      },
    },
    items: {
      data: [
        {
          id: "si-example",
          price: { id: "price-plus" },
          current_period_start: 1_783_123_200,
          current_period_end: 1_785_801_600,
        },
      ],
    },
  } as unknown as Stripe.Response<Stripe.Subscription>);
  const prisma = {
    billingProviderEvent: { findUnique: vi.fn(async () => null as unknown) },
    organizationBilling: { findUnique: vi.fn(async () => ({ organizationId: "org-1" })) },
  };
  return { stripe, retrieve, prisma: prisma as unknown as PrismaClient, rawPrisma: prisma };
}

beforeEach(() => vi.clearAllMocks());

describe("Stripe webhook", () => {
  it("uses the live subscription status and persisted customer binding", async () => {
    const { prisma, stripe, retrieve } = fixture();
    await processStripeBillingEvent(prisma, stripe, event);
    expect(retrieve).toHaveBeenCalledWith("sub-example", { expand: ["latest_invoice"] });
    expect(applyStripeSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        status: "active",
        eventId: "evt-example",
        priceId: "price-plus",
        currentPeriodStart: 1_783_123_200,
      }),
    );
  });

  it("deduplicates before contacting Stripe again", async () => {
    const { prisma, stripe, retrieve, rawPrisma } = fixture();
    rawPrisma.billingProviderEvent.findUnique.mockResolvedValue({ id: "stripe:evt-example" });
    await processStripeBillingEvent(prisma, stripe, event);
    expect(retrieve).not.toHaveBeenCalled();
    expect(applyStripeSubscription).not.toHaveBeenCalled();
  });

  it.each(["draft", "open", "uncollectible", "void"])(
    "does not grant an active subscription with a %s invoice",
    async (status) => {
      const { prisma, stripe, retrieve } = fixture();
      const subscription = await retrieve("sub-example");
      retrieve.mockResolvedValue({
        ...subscription,
        latest_invoice: { id: "in-example", status },
      } as unknown as Stripe.Response<Stripe.Subscription>);
      await expect(processStripeBillingEvent(prisma, stripe, event)).rejects.toThrow(
        /payment has not been confirmed/,
      );
      expect(applyStripeSubscription).not.toHaveBeenCalled();
    },
  );

  it("does not infer payment if the invoice expansion is unavailable", async () => {
    const { prisma, stripe, retrieve } = fixture();
    const subscription = await retrieve("sub-example");
    retrieve.mockResolvedValue({ ...subscription, latest_invoice: "in-example" });
    await expect(processStripeBillingEvent(prisma, stripe, event)).rejects.toThrow(
      /payment has not been confirmed/,
    );
    expect(applyStripeSubscription).not.toHaveBeenCalled();
  });

  it("records an incomplete subscription without claiming it is paid", async () => {
    const { prisma, stripe, retrieve } = fixture();
    const subscription = await retrieve("sub-example");
    retrieve.mockResolvedValue({ ...subscription, status: "incomplete" });
    await processStripeBillingEvent(prisma, stripe, event);
    expect(applyStripeSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ status: "incomplete" }),
    );
  });

  it("retries a phase transition whose latest paid invoice belongs to the prior plan", async () => {
    const { prisma, stripe, retrieve } = fixture();
    const subscription = await retrieve("sub-example");
    subscription.items.data[0]!.price.id = "price-pro";
    retrieve.mockResolvedValue(subscription);
    await expect(processStripeBillingEvent(prisma, stripe, event)).rejects.toThrow(
      "payment has not been confirmed",
    );
    expect(applyStripeSubscription).not.toHaveBeenCalled();
  });

  it("verifies the raw signature before reading billing state", async () => {
    const { prisma, stripe, rawPrisma } = fixture();
    const app = new Hono();
    mountStripeWebhook(app, prisma, { stripe, secret: "whsec_example", enabled: true });
    const response = await app.request("/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "invalid" },
      body: JSON.stringify(event),
    });
    expect(response.status).toBe(400);
    expect(rawPrisma.organizationBilling.findUnique).not.toHaveBeenCalled();
  });

  it("returns a retryable failure rather than downgrading on retrieval failure", async () => {
    const { prisma, stripe, retrieve } = fixture();
    retrieve.mockRejectedValue(new Error("temporary failure"));
    const app = new Hono();
    const secret = "whsec_example";
    mountStripeWebhook(app, prisma, { stripe, secret, enabled: true });
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const response = await app.request("/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    });
    expect(response.status).toBe(503);
    expect(applyStripeSubscription).not.toHaveBeenCalled();
  });
});
