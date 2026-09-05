import type { PlanId } from "@rakazo/core";
import { ensureUsagePeriod, withBillingLock } from "./billing-ledger.js";
import type { PrismaClient } from "./client.js";

export interface SubscriptionEventInput {
  organizationId: string;
  eventId: string;
  occurredAt: Date;
  customerId: string;
  subscriptionId: string;
  priceId: string | null;
  plan: PlanId;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  now?: Date;
}

/** Persist the provider event and entitlement change together; stale deliveries cannot rewind state. */
export async function applySubscriptionEvent(
  prisma: PrismaClient,
  input: SubscriptionEventInput,
): Promise<"applied" | "duplicate" | "stale"> {
  if (!input.eventId || !Number.isFinite(input.occurredAt.getTime()))
    throw new Error("Invalid subscription event");
  return withBillingLock(prisma, input.organizationId, async (tx, billing) => {
    const id = `stripe:${input.eventId}`;
    if (await tx.billingProviderEvent.findUnique({ where: { id } })) return "duplicate";
    if (billing.stripeCustomerId && billing.stripeCustomerId !== input.customerId)
      throw new Error("Subscription customer does not belong to this organization");
    const stale = Boolean(
      billing.lastProviderEventAt && input.occurredAt < billing.lastProviderEventAt,
    );
    await tx.billingProviderEvent.create({
      data: {
        id,
        organizationId: input.organizationId,
        provider: "stripe",
        occurredAt: input.occurredAt,
      },
    });
    if (stale) return "stale";
    // Never let an old subscription's cancellation overwrite a newer subscription.
    if (
      billing.stripeSubscriptionId &&
      billing.stripeSubscriptionId !== input.subscriptionId &&
      input.status !== "active" &&
      input.status !== "trialing"
    )
      return "stale";
    // Equal-second deliveries can race. A canceled subscription cannot be revived.
    if (
      billing.stripeSubscriptionId === input.subscriptionId &&
      billing.status === "canceled" &&
      input.status !== "canceled"
    )
      return "stale";
    const grantsPaidAccess = input.status === "active" || input.status === "trialing";
    if (
      grantsPaidAccess &&
      input.plan !== "free" &&
      (!input.periodStart ||
        !input.periodEnd ||
        !Number.isFinite(input.periodStart.getTime()) ||
        !Number.isFinite(input.periodEnd.getTime()) ||
        input.periodEnd <= input.periodStart)
    ) {
      throw new Error("Paid subscription is missing a valid billing period");
    }
    const updated = await tx.organizationBilling.update({
      where: { organizationId: input.organizationId },
      data: {
        plan: grantsPaidAccess ? input.plan : "free",
        status: input.status,
        stripeCustomerId: input.customerId,
        stripeSubscriptionId: input.subscriptionId,
        stripePriceId: input.priceId,
        currentPeriodStart: input.periodStart,
        currentPeriodEnd: input.periodEnd,
        lastProviderEventAt: input.occurredAt,
      },
    });
    await ensureUsagePeriod(tx, updated, input.now ?? new Date());
    return "applied";
  });
}
