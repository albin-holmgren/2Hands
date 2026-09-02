import Stripe from "stripe";
import {
  type PlanId,
  parsePlanId,
  PLANS,
  stripePriceEnvName,
} from "@rakazo/core";
import {
  ensureOrganizationBilling,
  organizationIdForSpace,
} from "@rakazo/db";
import type { PrismaClient } from "@rakazo/db";

export function createStripeClient(secret = process.env.STRIPE_SECRET_KEY): Stripe | null {
  const key = secret?.trim();
  if (!key) return null;
  return new Stripe(key);
}

export function priceIdForPlan(plan: Exclude<PlanId, "free">, env = process.env): string | undefined {
  return env[stripePriceEnvName(plan)]?.trim() || undefined;
}

export function planForPriceId(priceId: string | null | undefined, env = process.env): PlanId {
  if (!priceId) return "free";
  if (priceId === env.STRIPE_PRICE_PLUS?.trim()) return "plus";
  if (priceId === env.STRIPE_PRICE_PRO?.trim()) return "pro";
  if (priceId === env.STRIPE_PRICE_ULTRA?.trim()) return "ultra";
  return "free";
}

export async function billingSnapshot(prisma: PrismaClient, spaceId: string) {
  const organizationId = await organizationIdForSpace(prisma, spaceId);
  const billing = await ensureOrganizationBilling(prisma, organizationId);
  return {
    plan: billing.plan,
    planName: billing.entitlements.name,
    priceUsd: billing.entitlements.priceUsd,
    status: billing.status,
    currentPeriodEnd: billing.currentPeriodEnd?.toISOString() ?? null,
    maxBots: billing.entitlements.maxBots,
    maxPlugins:
      billing.entitlements.maxPlugins === Number.POSITIVE_INFINITY
        ? null
        : billing.entitlements.maxPlugins,
    harnesses: billing.entitlements.harnesses,
    modelTiers: billing.entitlements.modelTiers,
    monthlyTokens: billing.entitlements.monthlyTokens,
    tokensUsed: billing.inputTokensUsed + billing.outputTokensUsed,
    computerHours: billing.entitlements.computerHours,
    computerSecondsUsed: billing.computerSecondsUsed,
    checkoutEnabled: Boolean(createStripeClient()),
  };
}

export async function createCheckoutUrl(options: {
  prisma: PrismaClient;
  spaceId: string;
  email: string;
  plan: Exclude<PlanId, "free">;
  webOrigin: string;
}): Promise<string> {
  const stripe = createStripeClient();
  if (!stripe) throw new Error("Stripe is not configured");
  const price = priceIdForPlan(options.plan);
  if (!price) throw new Error(`Missing Stripe price for ${options.plan}`);
  const organizationId = await organizationIdForSpace(options.prisma, options.spaceId);
  const billing = await ensureOrganizationBilling(options.prisma, organizationId);
  const customerId =
    billing.stripeCustomerId ??
    (
      await stripe.customers.create({
        email: options.email,
        metadata: { organizationId },
      })
    ).id;
  if (!billing.stripeCustomerId) {
    await options.prisma.organizationBilling.update({
      where: { organizationId },
      data: { stripeCustomerId: customerId },
    });
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${options.webOrigin}/app?billing=success`,
    cancel_url: `${options.webOrigin}/app?billing=cancel`,
    metadata: { organizationId, plan: options.plan },
    subscription_data: { metadata: { organizationId, plan: options.plan } },
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalUrl(options: {
  prisma: PrismaClient;
  spaceId: string;
  webOrigin: string;
}): Promise<string> {
  const stripe = createStripeClient();
  if (!stripe) throw new Error("Stripe is not configured");
  const organizationId = await organizationIdForSpace(options.prisma, options.spaceId);
  const billing = await ensureOrganizationBilling(options.prisma, organizationId);
  if (!billing.stripeCustomerId) throw new Error("No Stripe customer for this workspace yet");
  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: `${options.webOrigin}/app`,
  });
  return session.url;
}

export async function applyStripeSubscription(options: {
  prisma: PrismaClient;
  organizationId: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  priceId?: string | null;
  status?: string | null;
  currentPeriodEnd?: number | null;
}): Promise<void> {
  const plan =
    options.status === "canceled" || options.status === "unpaid"
      ? "free"
      : planForPriceId(options.priceId);
  await ensureOrganizationBilling(options.prisma, options.organizationId);
  await options.prisma.organizationBilling.update({
    where: { organizationId: options.organizationId },
    data: {
      plan,
      status: options.status ?? (plan === "free" ? "active" : "unknown"),
      stripeCustomerId: options.customerId ?? undefined,
      stripeSubscriptionId: options.subscriptionId ?? undefined,
      stripePriceId: options.priceId ?? undefined,
      currentPeriodEnd: options.currentPeriodEnd
        ? new Date(options.currentPeriodEnd * 1000)
        : undefined,
    },
  });
}

export { parsePlanId, PLANS };
