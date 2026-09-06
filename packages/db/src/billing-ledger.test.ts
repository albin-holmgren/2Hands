import { describe, expect, it } from "vitest";
import { ensureOrganizationBilling } from "./billing.js";
import { releaseUsage, reserveUsage, settleUsage, usdToMicros } from "./billing-ledger.js";
import { billingTestStore } from "./testing/billing-store.js";

const september = new Date("2026-09-04T12:00:00Z");
const input = {
  organizationId: "org-1",
  spaceId: "space-1",
  userId: "user-1",
  runId: "run-1",
  kind: "ai" as const,
  funding: "hosted" as const,
  now: september,
};

describe("usage allowance ledger", () => {
  it("atomically admits only one of two concurrent requests beyond the allowance", async () => {
    const { prisma } = billingTestStore();
    const results = await Promise.allSettled(
      ["one", "two"].map((operationKey) =>
        reserveUsage(prisma, { ...input, operationKey, amountUsd: 0.7 }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "ALLOWANCE_EXHAUSTED" },
    });
    expect(await ensureOrganizationBilling(prisma, "org-1", september)).toMatchObject({
      allowanceUsd: 1,
      reservedUsd: 0.7,
      remainingUsd: 0.3,
    });
  });

  it("deduplicates reservations and settlements, without hiding conflicting retries", async () => {
    const { prisma, state } = billingTestStore();
    const request = { ...input, operationKey: "turn-1", amountUsd: 0.5 };
    const row = await reserveUsage(prisma, request);
    expect(await reserveUsage(prisma, request)).toEqual(row);
    await expect(reserveUsage(prisma, { ...request, amountUsd: 0.6 })).rejects.toThrow(
      /different inputs/,
    );
    const settlement = {
      reservationId: row.id,
      actualAmountUsd: 0.2,
      usage: {
        provider: "example",
        model: "small",
        inputTokens: 100,
        outputTokens: 50,
        rate: { input: 1, output: 2 },
      },
    };
    await settleUsage(prisma, settlement);
    await settleUsage(prisma, settlement);
    await expect(settleUsage(prisma, { ...settlement, actualAmountUsd: 0.3 })).rejects.toThrow(
      /different amount/,
    );
    await releaseUsage(prisma, { reservationId: row.id });
    expect(await ensureOrganizationBilling(prisma, "org-1", september)).toMatchObject({
      spentUsd: 0.2,
      reservedUsd: 0,
      remainingUsd: 0.8,
    });
    expect(state().reservations.get(row.id)?.metadata).toMatchObject(settlement.usage);
  });

  it("releases once, while late actual usage is still charged exactly once", async () => {
    const { prisma } = billingTestStore();
    const row = await reserveUsage(prisma, { ...input, operationKey: "cancel", amountUsd: 0.4 });
    await releaseUsage(prisma, { reservationId: row.id });
    await releaseUsage(prisma, { reservationId: row.id });
    await settleUsage(prisma, { reservationId: row.id, actualAmountUsd: 0.1 });
    expect(await ensureOrganizationBilling(prisma, "org-1", september)).toMatchObject({
      spentUsd: 0.1,
      reservedUsd: 0,
    });
  });

  it("preserves real overspend and permits BYOK AI without debiting the hosted allowance", async () => {
    const { prisma } = billingTestStore();
    const hosted = await reserveUsage(prisma, { ...input, operationKey: "hosted", amountUsd: 1 });
    await settleUsage(prisma, { reservationId: hosted.id, actualAmountUsd: 1.2 });
    const byok = await reserveUsage(prisma, {
      ...input,
      funding: "byok",
      operationKey: "byok",
      amountUsd: 4,
    });
    expect(byok).toMatchObject({ amountUsd: 0, billable: false });
    await settleUsage(prisma, { reservationId: byok.id, actualAmountUsd: 3 });
    await expect(
      reserveUsage(prisma, {
        ...input,
        kind: "computer",
        funding: "byok",
        operationKey: "compute",
        amountUsd: 0.01,
      }),
    ).rejects.toThrow(/used up/);
    expect(await ensureOrganizationBilling(prisma, "org-1", september)).toMatchObject({
      spentUsd: 1.2,
      remainingUsd: 0,
      exhausted: true,
    });
  });

  it("settles delayed usage in its original month without resetting the next month", async () => {
    const { prisma, state } = billingTestStore();
    const row = await reserveUsage(prisma, { ...input, operationKey: "september", amountUsd: 0.8 });
    const october = new Date("2026-10-03T00:00:00Z");
    await ensureOrganizationBilling(prisma, "org-1", october);
    await settleUsage(prisma, { reservationId: row.id, actualAmountUsd: 0.6, now: october });
    expect(await ensureOrganizationBilling(prisma, "org-1", october)).toMatchObject({
      spentUsd: 0,
      reservedUsd: 0,
      remainingUsd: 1,
      resetAt: "2026-11-01T00:00:00.000Z",
    });
    expect(state().periods.get("2026-09-01T00:00:00.000Z")?.spentMicros).toBe(600_000n);
  });

  it("denies spending against another workspace, user, or run", async () => {
    const { prisma } = billingTestStore();
    for (const override of [
      { spaceId: "other" },
      { userId: "other" },
      { organizationId: "other" },
      { runId: "other" },
    ]) {
      await expect(
        reserveUsage(prisma, { ...input, ...override, operationKey: "isolation", amountUsd: 0.1 }),
      ).rejects.toThrow(/Resource not found/);
    }
  });

  it("does not grant a new paid allowance when renewal confirmation is late", async () => {
    const { prisma } = billingTestStore({
      plan: "plus",
      stripeSubscriptionId: "sub-example",
      currentPeriodStart: new Date("2026-08-01"),
      currentPeriodEnd: new Date("2026-09-01"),
    });
    expect(await ensureOrganizationBilling(prisma, "org-1", september)).toMatchObject({
      allowanceUsd: 0,
      remainingUsd: 0,
      exhausted: true,
    });
    await expect(
      reserveUsage(prisma, { ...input, operationKey: "expired", amountUsd: 0.1 }),
    ).rejects.toThrow(/used up/);
  });

  it("rounds fractional microdollars upwards and rejects invalid costs", () => {
    expect(usdToMicros(0.0000001)).toBe(1n);
    for (const amount of [NaN, Infinity, -1, 1_000_001])
      expect(() => usdToMicros(amount)).toThrow();
  });
});

describe("legacy subscription transition", () => {
  const legacy = {
    plan: "plus",
    stripeSubscriptionId: "sub-example",
    currentPeriodStart: new Date("2026-09-01"),
    currentPeriodEnd: new Date("2026-10-01"),
    usageAllowanceStartsAt: new Date("2026-10-01"),
  };
  it("preserves remaining token units until renewal and reserves them atomically", async () => {
    const { prisma } = billingTestStore({ ...legacy, inputTokensUsed: 3_999_990 });
    const request = {
      ...input,
      amountUsd: 0.5,
      metadata: { inputTokenLimit: 4, outputTokenLimit: 2 },
    };
    const outcomes = await Promise.allSettled(
      ["one", "two"].map((operationKey) => reserveUsage(prisma, { ...request, operationKey })),
    );
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const admitted = outcomes.find((outcome) => outcome.status === "fulfilled");
    if (admitted?.status !== "fulfilled") throw new Error("Missing reservation");
    const settlement = {
      reservationId: admitted.value.id,
      actualAmountUsd: 0.2,
      usage: { input: 2, output: 1, cacheRead: 0, cacheWrite: 0 },
    };
    await settleUsage(prisma, settlement);
    await settleUsage(prisma, settlement);
    expect(await ensureOrganizationBilling(prisma, "org-1", september)).toMatchObject({
      plan: "plus",
      legacyUntil: "2026-10-01T00:00:00.000Z",
      allowanceUsd: 0,
      inputTokensUsed: 3_999_992,
      outputTokensUsed: 1,
    });
  });

  it("requires bounded legacy units and preserves the existing computer limit", async () => {
    const { prisma } = billingTestStore({ ...legacy, computerSecondsUsed: 40 * 3600 - 100 });
    await expect(
      reserveUsage(prisma, { ...input, operationKey: "unbounded", amountUsd: 0.01 }),
    ).rejects.toThrow(/unit count/);
    await expect(
      reserveUsage(prisma, {
        ...input,
        operationKey: "computer",
        amountUsd: 0.01,
        kind: "computer",
        metadata: { computerSecondsLimit: 300 },
      }),
    ).rejects.toThrow(/computer allowance/);
  });

  it("waits for renewal confirmation before granting the new dollar allowance", async () => {
    const { prisma, state } = billingTestStore({ ...legacy, inputTokensUsed: 500 });
    const october = new Date("2026-10-02");
    expect(await ensureOrganizationBilling(prisma, "org-1", october)).toMatchObject({
      allowanceUsd: 0,
      legacyUntil: null,
      exhausted: true,
    });
    state().billing.currentPeriodStart = new Date("2026-10-01");
    state().billing.currentPeriodEnd = new Date("2026-11-01");
    expect(await ensureOrganizationBilling(prisma, "org-1", october)).toMatchObject({
      plan: "plus",
      allowanceUsd: 10,
      legacyUntil: null,
      inputTokensUsed: 0,
    });
  });
});
