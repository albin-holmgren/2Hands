import { randomUUID } from "node:crypto";
import { createDb, ensureOrganizationBilling, reserveUsage, settleUsage } from "@rakazo/db";
import { Hono } from "hono";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { testDatabaseUrl } from "../../../packages/testkit/src/cli/test-database-url.js";
import { mountStripeWebhook } from "./stripe-webhook.js";

const enabled = process.env.VERIFY_DATABASE === "1";
(enabled ? describe : describe.skip)("Stripe paid-invoice gate (PostgreSQL)", () => {
  it("keeps the verified allowance on unpaid invoice delivery, then grants and deduplicates the paid retry", async () => {
    const databaseUrl = testDatabaseUrl(process.env.DATABASE_URL);
    if (!databaseUrl) throw new Error("Disposable test database required");
    const { prisma, pool } = createDb(databaseUrl);
    const organizationId = `stripe-org-${randomUUID()}`;
    const userId = `stripe-user-${randomUUID()}`;
    const spaceId = `stripe-space-${randomUUID()}`;
    const customerId = `cus_${randomUUID()}`;
    const now = new Date();
    const start = Math.floor(now.getTime() / 1000) - 3_600;
    const end = start + 30 * 24 * 3_600;
    const stripe = new Stripe("sk_test_example");
    const invoice = (id: string, status: string, price: string) => ({
      id,
      status,
      subscription: "sub_example",
      lines: {
        data: [
          {
            subscription_item: "si_example",
            proration: false,
            price: { id: price },
            period: { start, end },
          },
        ],
      },
    });
    let subscription = {
      id: "sub_example",
      customer: customerId,
      status: "active",
      latest_invoice: invoice("in_example", "open", "price_plus"),
      items: {
        data: [
          {
            id: "si_example",
            price: { id: "price_plus" },
            current_period_start: start,
            current_period_end: end,
          },
        ],
      },
    };
    vi.spyOn(stripe.subscriptions, "retrieve").mockImplementation(
      async () => subscription as unknown as Stripe.Response<Stripe.Subscription>,
    );
    vi.stubEnv("STRIPE_PRICE_PLUS", "price_plus");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    const app = new Hono();
    const secret = "whsec_test_only";
    mountStripeWebhook(app, prisma, { stripe, secret, enabled: true });
    async function deliver(id: string) {
      const payload = JSON.stringify({
        id,
        object: "event",
        livemode: false,
        created: start,
        type: "customer.subscription.updated",
        data: { object: { id: subscription.id, customer: customerId } },
      });
      return app.request("/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret }),
        },
        body: payload,
      });
    }
    try {
      await prisma.user.create({
        data: { id: userId, name: "Stripe Test", email: `${userId}@example.test` },
      });
      await prisma.organization.create({
        data: { id: organizationId, name: "Stripe Test", slug: organizationId, createdAt: now },
      });
      await prisma.member.create({
        data: { id: randomUUID(), organizationId, userId, role: "owner", createdAt: now },
      });
      await prisma.space.create({ data: { id: spaceId, organizationId, name: "Stripe Test" } });
      await prisma.spaceMember.create({
        data: { id: randomUUID(), organizationId, spaceId, userId, role: "owner", createdAt: now },
      });
      await ensureOrganizationBilling(prisma, organizationId, now);
      await prisma.organizationBilling.update({
        where: { organizationId },
        data: { stripeCustomerId: customerId },
      });

      const initialId = `evt_${randomUUID()}`;
      expect((await deliver(initialId)).status).toBe(503);
      expect(await prisma.billingProviderEvent.count({ where: { organizationId } })).toBe(0);
      expect(await ensureOrganizationBilling(prisma, organizationId, now)).toMatchObject({
        plan: "free",
        allowanceUsd: 1,
      });
      subscription.latest_invoice.status = "paid";
      expect((await deliver(initialId)).status).toBe(200);
      expect(await ensureOrganizationBilling(prisma, organizationId, now)).toMatchObject({
        plan: "plus",
        allowanceUsd: 10,
      });
      const hold = await reserveUsage(prisma, {
        organizationId,
        userId,
        spaceId,
        operationKey: "test-spend",
        amountUsd: 1,
        kind: "ai",
        funding: "hosted",
        now,
      });
      await settleUsage(prisma, { reservationId: hold.id, actualAmountUsd: 0.25, now });

      // A pending upgrade must preserve both the already-paid plan and its settled usage.
      subscription = {
        ...subscription,
        latest_invoice: invoice("in_upgrade", "draft", "price_pro"),
        items: {
          data: [
            {
              id: "si_example",
              price: { id: "price_pro" },
              current_period_start: start,
              current_period_end: end,
            },
          ],
        },
      };
      const upgradeId = `evt_${randomUUID()}`;
      expect((await deliver(upgradeId)).status).toBe(503);
      expect(await ensureOrganizationBilling(prisma, organizationId, now)).toMatchObject({
        plan: "plus",
        allowanceUsd: 10,
        spentUsd: 0.25,
      });
      subscription.latest_invoice.status = "paid";
      const retries = await Promise.all([
        deliver(upgradeId),
        deliver(upgradeId),
        deliver(upgradeId),
      ]);
      expect(retries.map((response) => response.status)).toEqual([200, 200, 200]);
      expect(await prisma.billingProviderEvent.count({ where: { organizationId } })).toBe(2);
      expect(await ensureOrganizationBilling(prisma, organizationId, now)).toMatchObject({
        plan: "pro",
        allowanceUsd: 30,
        spentUsd: 0.25,
        reservedUsd: 0,
      });
    } finally {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
      await pool.end();
    }
  });
});
