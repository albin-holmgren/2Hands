import { hostedBillingEnabled } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import type { Hono } from "hono";
import type Stripe from "stripe";
import { applyStripeSubscription, createStripeClient } from "./stripe-billing.js";
import {
  invoiceConfirmsSubscriptionPeriod,
  type PaidPeriodInvoice,
} from "./stripe-invoice-payment.js";

const SUBSCRIPTION_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

function objectId(value: string | { id?: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

type SubscriptionObject = {
  id?: string;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  parent?: { subscription_details?: { subscription?: string | { id?: string } | null } };
  status?: string;
  latest_invoice?: string | PaidPeriodInvoice | null;
  items?: {
    data?: Array<{
      id?: string;
      price?: { id?: string };
      current_period_start?: number;
      current_period_end?: number;
    }>;
  };
  current_period_start?: number;
  current_period_end?: number;
};

/** Retrieval failures propagate: Stripe must retry, not silently remove or grant entitlements. */
export async function processStripeBillingEvent(
  prisma: PrismaClient,
  stripe: Pick<Stripe, "subscriptions">,
  event: Stripe.Event,
): Promise<void> {
  if (!SUBSCRIPTION_EVENTS.has(event.type)) return;
  if (await prisma.billingProviderEvent.findUnique({ where: { id: `stripe:${event.id}` } })) return;
  const object = event.data.object as SubscriptionObject;
  const customerId = objectId(object.customer);
  if (!customerId) throw new Error("Subscription event is missing its customer");
  // Checkout binds this ID before creating a session; external metadata is not authorization.
  const billing = await prisma.organizationBilling.findUnique({
    where: { stripeCustomerId: customerId },
    select: { organizationId: true },
  });
  if (!billing) return;
  const subscriptionId = event.type.startsWith("customer.subscription")
    ? object.id
    : (objectId(object.subscription) ??
      objectId(object.parent?.subscription_details?.subscription));
  if (!subscriptionId) {
    // One-off invoices and non-subscription checkout sessions are unrelated to these plans.
    return;
  }
  const subscription: SubscriptionObject =
    event.type === "customer.subscription.deleted"
      ? { ...object, status: "canceled" }
      : await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
  if (objectId(subscription.customer) !== customerId)
    throw new Error("Subscription customer mismatch");
  const item = subscription.items?.data?.[0];
  if (!subscription.status) throw new Error("Subscription status is unavailable");
  // `active` can precede payment for asynchronous methods or a renewal's draft invoice.
  // Keep the last verified allowance until payment succeeds; the retry / invoice.paid
  // delivery will reconcile it. Never create a new paid period from status alone.
  if (
    subscription.status === "active" &&
    !invoiceConfirmsSubscriptionPeriod(subscription.latest_invoice, {
      subscriptionId,
      itemId: item?.id,
      priceId: item?.price?.id,
      start: subscription.current_period_start ?? item?.current_period_start,
      end: subscription.current_period_end ?? item?.current_period_end,
    })
  ) {
    throw new Error("Subscription payment has not been confirmed");
  }
  await applyStripeSubscription({
    prisma,
    organizationId: billing.organizationId,
    eventId: event.id,
    occurredAt: event.created,
    customerId,
    subscriptionId,
    priceId: item?.price?.id ?? null,
    status: subscription.status,
    currentPeriodStart: subscription.current_period_start ?? item?.current_period_start ?? null,
    currentPeriodEnd: subscription.current_period_end ?? item?.current_period_end ?? null,
  });
}

export function mountStripeWebhook(
  app: Hono,
  prisma: PrismaClient,
  dependencies: {
    stripe?: Stripe;
    secret?: string;
    enabled?: boolean;
  } = {},
): void {
  app.post("/api/stripe/webhook", async (c) => {
    const stripe = dependencies.stripe ?? createStripeClient();
    const secret = dependencies.secret ?? process.env.STRIPE_WEBHOOK_SECRET?.trim();
    const enabled = dependencies.enabled ?? hostedBillingEnabled(process.env.BILLING_ENABLED);
    if (!enabled || !stripe || !secret)
      return c.json({ error: "Stripe webhook is not configured" }, 503);
    const signature = c.req.header("stripe-signature");
    if (!signature) return c.json({ error: "Missing stripe-signature" }, 400);
    const raw = await c.req.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(raw, signature, secret);
    } catch {
      return c.json({ error: "Invalid Stripe signature" }, 400);
    }
    try {
      await processStripeBillingEvent(prisma, stripe, event);
    } catch {
      console.error("Stripe billing event requires retry", event.id);
      return c.json({ error: "Could not process billing event" }, 503);
    }
    return c.json({ received: true });
  });
}
