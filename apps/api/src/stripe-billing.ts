import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import {
  hostedBillingEnabled,
  PLANS,
  type PlanId,
  parsePlanId,
  stripePriceEnvName,
} from "@rakazo/core";
import {
  applySubscriptionEvent,
  ensureOrganizationBilling,
  organizationIdForSpace,
  type PrismaClient,
  withBillingLock,
} from "@rakazo/db";
import Stripe from "stripe";

export function createStripeClient(secret = process.env.STRIPE_SECRET_KEY): Stripe | null {
  const key = secret?.trim();
  return key ? new Stripe(key, { timeout: 15_000, maxNetworkRetries: 2 }) : null;
}

export function priceIdForPlan(
  plan: Exclude<PlanId, "free">,
  env = process.env,
): string | undefined {
  return env[stripePriceEnvName(plan)]?.trim() || undefined;
}

export function planForPriceId(priceId: string | null | undefined, env = process.env): PlanId {
  if (!priceId) return "free";
  if (priceId === env.STRIPE_PRICE_PLUS?.trim()) return "plus";
  if (priceId === env.STRIPE_PRICE_PRO?.trim()) return "pro";
  if (priceId === env.STRIPE_PRICE_ULTRA?.trim()) return "ultra";
  return "free";
}

export async function assertBillingOwner(
  prisma: PrismaClient,
  spaceId: string,
  userId: string,
): Promise<string> {
  const organizationId = await organizationIdForSpace(prisma, spaceId);
  const membership = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  if (
    !membership?.role
      .split(",")
      .map((role) => role.trim())
      .includes("owner")
  ) {
    throw new ORPCError("FORBIDDEN", {
      message: "Only the organization owner can manage billing.",
    });
  }
  return organizationId;
}

export async function billingSnapshot(prisma: PrismaClient, spaceId: string) {
  const organizationId = await organizationIdForSpace(prisma, spaceId);
  const billing = await ensureOrganizationBilling(prisma, organizationId);
  const billingEnabled = hostedBillingEnabled(process.env.BILLING_ENABLED);
  return {
    plan: billing.plan,
    planName: billing.entitlements.name,
    priceUsd: billing.entitlements.priceUsd,
    status: billing.status,
    currentPeriodEnd: billing.currentPeriodEnd?.toISOString() ?? null,
    maxBots: billing.entitlements.maxBots,
    maxPlugins: Number.isFinite(billing.entitlements.maxPlugins)
      ? billing.entitlements.maxPlugins
      : null,
    harnesses: billing.entitlements.harnesses,
    modelTiers: billing.entitlements.modelTiers,
    monthlyTokens: billing.entitlements.monthlyTokens,
    tokensUsed: billing.inputTokensUsed + billing.outputTokensUsed,
    computerHours: billing.entitlements.computerHours,
    computerSecondsUsed: billing.computerSecondsUsed,
    checkoutEnabled:
      billingEnabled &&
      Boolean(process.env.STRIPE_SECRET_KEY?.trim()) &&
      ["plus", "pro", "ultra"].some((plan) => priceIdForPlan(plan as Exclude<PlanId, "free">)),
    billingEnabled,
    legacyUntil: billing.legacyUntil,
    allowanceUsd: billing.allowanceUsd,
    spentUsd: billing.spentUsd,
    reservedUsd: billing.reservedUsd,
    remainingUsd: billing.remainingUsd,
    resetAt: billing.resetAt,
    exhausted: billingEnabled && billing.exhausted,
  };
}

function stripeForBilling() {
  if (!hostedBillingEnabled(process.env.BILLING_ENABLED))
    throw new ORPCError("BAD_REQUEST", { message: "Hosted billing is not enabled." });
  const stripe = createStripeClient();
  if (!stripe) throw new ORPCError("BAD_REQUEST", { message: "Billing is not configured." });
  return stripe;
}

export async function createCheckoutUrl(
  options: {
    prisma: PrismaClient;
    spaceId: string;
    userId: string;
    email: string;
    plan: Exclude<PlanId, "free">;
    webOrigin: string;
  },
  dependencies: { stripe?: Stripe } = {},
): Promise<string> {
  const organizationId = await assertBillingOwner(options.prisma, options.spaceId, options.userId);
  const stripe = dependencies.stripe ?? stripeForBilling();
  const price = priceIdForPlan(options.plan);
  if (!price) throw new Error("This plan is not available yet.");
  // Serialize customer/session creation with every other checkout for this organization.
  // Stripe's open-session list also recovers a successful create whose DB transaction timed out.
  return withBillingLock(
    options.prisma,
    organizationId,
    async (tx, billing) => {
      const customerId =
        billing.stripeCustomerId ??
        (
          await stripe.customers.create(
            { email: options.email, metadata: { organizationId } },
            { idempotencyKey: `organization:${organizationId}:customer` },
          )
        ).id;
      if (!billing.stripeCustomerId)
        await tx.organizationBilling.update({
          where: { organizationId },
          data: { stripeCustomerId: customerId },
        });
      const [subscriptions, pending] = await Promise.all([
        stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 }),
        stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 }),
      ]);
      if (pending.has_more)
        throw new Error("Pending checkout state could not be verified. Try again later.");
      const activeSubscription =
        subscriptions.has_more ||
        subscriptions.data.some(
          (item) => !["canceled", "incomplete_expired"].includes(item.status),
        );
      const open = pending.data.filter((session) => session.mode === "subscription");
      const reusable = activeSubscription
        ? undefined
        : open.find(
            (session) =>
              session.metadata?.organizationId === organizationId &&
              session.metadata?.plan === options.plan &&
              session.url,
          );
      for (const session of open) {
        if (session.id !== reusable?.id) await stripe.checkout.sessions.expire(session.id);
      }
      if (activeSubscription)
        return (
          await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${options.webOrigin}/app`,
          })
        ).url;
      if (reusable?.url) return reusable.url;
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: customerId,
          line_items: [{ price, quantity: 1 }],
          success_url: `${options.webOrigin}/app?billing=success`,
          cancel_url: `${options.webOrigin}/app?billing=cancel`,
          metadata: { organizationId, plan: options.plan },
          subscription_data: { metadata: { organizationId, plan: options.plan } },
          allow_promotion_codes: true,
        },
        { idempotencyKey: `organization:${organizationId}:checkout:${randomUUID()}` },
      );
      if (!session.url) throw new Error("Could not create checkout.");
      return session.url;
    },
    { timeoutMs: 60_000 },
  );
}

export async function createPortalUrl(options: {
  prisma: PrismaClient;
  spaceId: string;
  userId: string;
  webOrigin: string;
}): Promise<string> {
  const organizationId = await assertBillingOwner(options.prisma, options.spaceId, options.userId);
  const stripe = stripeForBilling();
  const billing = await ensureOrganizationBilling(options.prisma, organizationId);
  if (!billing.stripeCustomerId) throw new Error("No subscription for this organization yet.");
  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: `${options.webOrigin}/app`,
  });
  return session.url;
}

export async function applyStripeSubscription(options: {
  prisma: PrismaClient;
  organizationId: string;
  eventId: string;
  occurredAt: number;
  customerId: string;
  subscriptionId: string;
  priceId: string | null;
  status: string;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
}) {
  return applySubscriptionEvent(options.prisma, {
    organizationId: options.organizationId,
    eventId: options.eventId,
    occurredAt: new Date(options.occurredAt * 1000),
    customerId: options.customerId,
    subscriptionId: options.subscriptionId,
    priceId: options.priceId,
    plan: planForPriceId(options.priceId),
    status: options.status,
    periodStart:
      options.currentPeriodStart === null ? null : new Date(options.currentPeriodStart * 1000),
    periodEnd: options.currentPeriodEnd === null ? null : new Date(options.currentPeriodEnd * 1000),
  });
}

export { PLANS, parsePlanId };
