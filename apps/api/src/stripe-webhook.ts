import type { PrismaClient } from "@rakazo/db";
import type { Hono } from "hono";
import { createStripeClient, applyStripeSubscription, planForPriceId } from "./stripe-billing.js";

export function mountStripeWebhook(app: Hono, prisma: PrismaClient): void {
  app.post("/api/stripe/webhook", async (c) => {
    const stripe = createStripeClient();
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!stripe || !secret) return c.json({ error: "Stripe webhook is not configured" }, 503);
    const signature = c.req.header("stripe-signature");
    if (!signature) return c.json({ error: "Missing stripe-signature" }, 400);
    const raw = await c.req.text();
    let event: ReturnType<typeof stripe.webhooks.constructEvent>;
    try {
      event = stripe.webhooks.constructEvent(raw, signature, secret);
    } catch {
      return c.json({ error: "Invalid Stripe signature" }, 400);
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const object = event.data.object as {
        metadata?: { organizationId?: string };
        customer?: string | { id?: string } | null;
        subscription?: string | { id?: string } | null;
        id?: string;
        status?: string;
        items?: { data?: Array<{ price?: { id?: string }; current_period_end?: number }> };
        current_period_end?: number;
      };
      const organizationId =
        object.metadata?.organizationId ??
        (await lookupOrganizationId(
          prisma,
          typeof object.customer === "string" ? object.customer : object.customer?.id,
        ));
      if (!organizationId) return c.json({ received: true });
      const subscriptionId =
        typeof object.subscription === "string"
          ? object.subscription
          : object.subscription?.id ??
            (event.type.startsWith("customer.subscription") ? object.id : undefined);
      let priceId = object.items?.data?.[0]?.price?.id;
      let periodEnd = object.current_period_end ?? object.items?.data?.[0]?.current_period_end;
      let status =
        event.type === "customer.subscription.deleted" ? "canceled" : object.status;
      if (subscriptionId && (!priceId || !status || !periodEnd) && event.type !== "customer.subscription.deleted") {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          priceId = priceId ?? subscription.items.data[0]?.price?.id;
          periodEnd = periodEnd ?? subscription.items.data[0]?.current_period_end;
          status = status ?? subscription.status;
        } catch (error) {
          console.error("stripe subscription retrieve", error);
        }
      }
      const customerId =
        typeof object.customer === "string" ? object.customer : object.customer?.id;
      const plan = event.type === "customer.subscription.deleted" ? "free" : planForPriceId(priceId);
      await applyStripeSubscription({
        prisma,
        organizationId,
        customerId,
        subscriptionId,
        priceId: plan === "free" ? null : priceId,
        status: plan === "free" ? "canceled" : status,
        currentPeriodEnd: periodEnd,
      });
    }

    return c.json({ received: true });
  });
}

async function lookupOrganizationId(
  prisma: PrismaClient,
  customerId: string | undefined,
): Promise<string | null> {
  if (!customerId) return null;
  const row = await prisma.organizationBilling.findUnique({
    where: { stripeCustomerId: customerId },
    select: { organizationId: true },
  });
  return row?.organizationId ?? null;
}
