import { describe, expect, it } from "vitest";
import { ensureOrganizationBilling } from "./billing.js";
import { applySubscriptionEvent } from "./billing-provider-events.js";
import { billingTestStore } from "./testing/billing-store.js";

const now = new Date("2026-09-04T12:00:00Z");
const event = {
  organizationId: "org-1",
  eventId: "event-1",
  occurredAt: now,
  customerId: "customer-1",
  subscriptionId: "subscription-1",
  priceId: "price-plus",
  plan: "plus" as const,
  status: "active",
  periodStart: new Date("2026-09-01"),
  periodEnd: new Date("2026-10-01"),
  now,
};

describe("subscription event persistence", () => {
  it("atomically deduplicates delivery and rejects stale state", async () => {
    const { prisma, state } = billingTestStore();
    expect(await applySubscriptionEvent(prisma, event)).toBe("applied");
    expect(await applySubscriptionEvent(prisma, event)).toBe("duplicate");
    expect(
      await applySubscriptionEvent(prisma, {
        ...event,
        eventId: "old",
        occurredAt: new Date("2026-09-03"),
        plan: "ultra",
      }),
    ).toBe("stale");
    expect(state().events.size).toBe(2);
    expect(await ensureOrganizationBilling(prisma, "org-1", now)).toMatchObject({
      plan: "plus",
      allowanceUsd: 10,
    });
  });

  it("does not grant paid access for incomplete or delinquent subscription states", async () => {
    for (const status of [
      "incomplete",
      "incomplete_expired",
      "past_due",
      "unpaid",
      "canceled",
      "paused",
    ]) {
      const { prisma } = billingTestStore();
      await applySubscriptionEvent(prisma, { ...event, status });
      expect(await ensureOrganizationBilling(prisma, "org-1", now)).toMatchObject({
        plan: "free",
        allowanceUsd: 1,
      });
    }
  });

  it("cannot revive a canceled subscription with an equal-second active event", async () => {
    const { prisma } = billingTestStore();
    await applySubscriptionEvent(prisma, { ...event, status: "canceled" });
    expect(await applySubscriptionEvent(prisma, { ...event, eventId: "active" })).toBe("stale");
  });

  it("rolls back receipt if entitlement validation fails so retries remain possible", async () => {
    const { prisma, state } = billingTestStore();
    await expect(applySubscriptionEvent(prisma, { ...event, periodEnd: null })).rejects.toThrow(
      /billing period/,
    );
    expect(state().events.size).toBe(0);
    expect(await applySubscriptionEvent(prisma, event)).toBe("applied");
  });

  it("rejects a provider customer not bound to this organization", async () => {
    const { prisma } = billingTestStore({ stripeCustomerId: "another-customer" });
    await expect(applySubscriptionEvent(prisma, event)).rejects.toThrow(/does not belong/);
  });
});
