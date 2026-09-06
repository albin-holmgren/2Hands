import { createRequire } from "node:module";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { createStripeClient } from "../../../../apps/api/src/stripe-billing.js";
import { mountStripeWebhook } from "../../../../apps/api/src/stripe-webhook.js";
import { STRIPE_DELIVERY_BODY_LIMIT, startStripeDeliveryServer } from "./stripe-delivery-server.js";

const path = `/stripe-delivery/${"a".repeat(48)}`;

describe("isolated Stripe public delivery ingress", () => {
  it("uses the production signature verifier over HTTP before touching the database", async () => {
    const apiRequire = createRequire(new URL("../../../../apps/api/package.json", import.meta.url));
    const { Hono } = await import(apiRequire.resolve("hono"));
    const app: Parameters<typeof mountStripeWebhook>[0] = new Hono();
    const findEvent = vi.fn(async () => null);
    const findCustomer = vi.fn(async () => null);
    const prisma = {
      billingProviderEvent: { findUnique: findEvent },
      organizationBilling: { findUnique: findCustomer },
    } as unknown as PrismaClient;
    const stripe = createStripeClient("sk_test_synthetic")!;
    const secret = "whsec_synthetic";
    mountStripeWebhook(app, prisma, { stripe, secret, enabled: true });
    const server = await startStripeDeliveryServer({
      path,
      webhook: (request) => app.fetch(request),
      delivered: () => undefined,
    });
    const payload = JSON.stringify({
      id: "evt_synthetic",
      type: "checkout.session.completed",
      livemode: false,
      data: { object: { customer: "cus_synthetic", subscription: "sub_synthetic" } },
    });
    try {
      const invalid = await fetch(`${server.origin}${path}`, {
        method: "POST",
        headers: { "stripe-signature": "invalid" },
        body: payload,
      });
      expect(invalid.status).toBe(400);
      expect(findEvent).not.toHaveBeenCalled();
      const valid = await fetch(`${server.origin}${path}`, {
        method: "POST",
        headers: {
          "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret }),
        },
        body: payload,
      });
      expect(valid.status).toBe(200);
      expect(findCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeCustomerId: "cus_synthetic" },
        }),
      );
    } finally {
      await server.close();
    }
  });

  it("exposes only its exact random POST route and requires a signature", async () => {
    const webhook = vi.fn(async () => new Response("{}"));
    const server = await startStripeDeliveryServer({ path, webhook, delivered: () => undefined });
    try {
      for (const route of [
        "/health",
        "/rpc/billing/get",
        "/api/stripe/webhook",
        `${path}?other=1`,
      ]) {
        expect((await fetch(`${server.origin}${route}`, { method: "POST" })).status).toBe(404);
      }
      expect((await fetch(`${server.origin}${path}`)).status).toBe(404);
      expect((await fetch(`${server.origin}${path}`, { method: "POST" })).status).toBe(400);
      expect(webhook).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it("preserves signed raw bytes and the actual production route response", async () => {
    const payload = '{ "synthetic": true }\n';
    const delivered = vi.fn();
    const server = await startStripeDeliveryServer({
      path,
      delivered,
      webhook: async (request) => {
        expect(new URL(request.url).pathname).toBe("/api/stripe/webhook");
        expect(request.headers.get("stripe-signature")).toBe("synthetic-signature");
        expect(await request.text()).toBe(payload);
        return new Response('{"error":"Invalid Stripe signature"}', { status: 400 });
      },
    });
    try {
      const response = await fetch(`${server.origin}${path}`, {
        method: "POST",
        headers: { "stripe-signature": "synthetic-signature" },
        body: payload,
      });
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(delivered).toHaveBeenCalledWith(payload, 400);
    } finally {
      await server.close();
    }
  });

  it("rejects oversized deliveries without invoking the billing handler", async () => {
    const webhook = vi.fn(async () => new Response("{}"));
    const server = await startStripeDeliveryServer({ path, webhook, delivered: () => undefined });
    try {
      const response = await fetch(`${server.origin}${path}`, {
        method: "POST",
        headers: { "stripe-signature": "synthetic-signature" },
        body: "x".repeat(STRIPE_DELIVERY_BODY_LIMIT + 1),
      });
      expect(response.status).toBe(413);
      expect(webhook).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});
