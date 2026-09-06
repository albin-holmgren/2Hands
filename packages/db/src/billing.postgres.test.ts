import { randomUUID } from "node:crypto";
import { PlanLimitError } from "@rakazo/core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { countOrganizationBots, ensureOrganizationBilling } from "./billing.js";
import { calendarUsagePeriod, releaseUsage, reserveUsage, settleUsage } from "./billing-ledger.js";
import { applySubscriptionEvent } from "./billing-provider-events.js";
import { createDb, type PrismaClient } from "./client.js";
import { createRepos } from "./repos.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("hosted allowance and bot admission (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let userId: string;
  let organizationId: string;
  let spaceId: string;
  const now = new Date();
  beforeAll(() => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
  });
  beforeEach(async () => {
    const suffix = randomUUID();
    userId = `billing-user-${suffix}`;
    organizationId = `billing-org-${suffix}`;
    spaceId = `billing-space-${suffix}`;
    await prisma.user.create({
      data: { id: userId, name: "Billing Test", email: `${userId}@example.test` },
    });
    await prisma.organization.create({
      data: { id: organizationId, name: "Billing Test", slug: organizationId, createdAt: now },
    });
    await prisma.space.create({
      data: { id: spaceId, organizationId, name: "Project", isDefault: true },
    });
    await prisma.member.create({
      data: { id: randomUUID(), organizationId, userId, role: "owner", createdAt: now },
    });
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });
  afterAll(async () => {
    await close?.();
  });
  const request = (operationKey: string, amountUsd = 0.6) => ({
    organizationId,
    spaceId,
    userId,
    operationKey,
    amountUsd,
    kind: "ai" as const,
    funding: "hosted" as const,
    now,
  });

  it("serializes competing requests including the very first billing-row creation", async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) => reserveUsage(prisma, request(`parallel-${index}`))),
    );
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    for (const outcome of outcomes)
      if (outcome.status === "rejected") expect(outcome.reason).toBeInstanceOf(PlanLimitError);
    expect(await ensureOrganizationBilling(prisma, organizationId, now)).toMatchObject({
      reservedUsd: 0.6,
      remainingUsd: 0.4,
    });
    expect(await prisma.usageReservation.count({ where: { organizationId } })).toBe(1);
  });

  it("settles concurrent retries once and never refunds settled usage", async () => {
    const reservation = await reserveUsage(prisma, request("same"));
    await Promise.all(
      Array.from({ length: 6 }, () =>
        settleUsage(prisma, { reservationId: reservation.id, actualAmountUsd: 0.25 }),
      ),
    );
    await releaseUsage(prisma, { reservationId: reservation.id });
    expect(await ensureOrganizationBilling(prisma, organizationId, now)).toMatchObject({
      spentUsd: 0.25,
      reservedUsd: 0,
      remainingUsd: 0.75,
    });
  });

  it("deduplicates webhook state and rejects older entitlement deliveries", async () => {
    const period = calendarUsagePeriod(now);
    const event = {
      organizationId,
      eventId: randomUUID(),
      occurredAt: now,
      customerId: `customer-${organizationId}`,
      subscriptionId: `subscription-${organizationId}`,
      priceId: "price-example",
      plan: "plus" as const,
      status: "active",
      periodStart: period.startsAt,
      periodEnd: period.endsAt,
      now,
    };
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, () => applySubscriptionEvent(prisma, event)),
    );
    expect(outcomes.filter((outcome) => outcome === "applied")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "duplicate")).toHaveLength(5);
    expect(
      await applySubscriptionEvent(prisma, {
        ...event,
        eventId: randomUUID(),
        occurredAt: new Date(now.getTime() - 1000),
        plan: "ultra",
      }),
    ).toBe("stale");
    expect(await ensureOrganizationBilling(prisma, organizationId, now)).toMatchObject({
      plan: "plus",
      allowanceUsd: 10,
    });
  });

  it("allows one default assistant per space and atomically caps additional agents", async () => {
    vi.stubEnv("BILLING_ENABLED", "true");
    const actor = { userId, spaceId, email: `${userId}@example.test`, isDeploymentOwner: false };
    const repos = createRepos(prisma);
    const bot = {
      name: "Assistant",
      title: "",
      description: "",
      instructions: "",
      notifyOnFinish: true,
    };
    await repos.createBot(actor, { ...bot, spawnKey: "chief-of-staff" });
    const outcomes = await Promise.allSettled([
      repos.createBot(actor, { ...bot, name: "One" }),
      repos.createBot(actor, { ...bot, name: "Two" }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(await countOrganizationBots(prisma, organizationId)).toBe(1);
    expect(await prisma.bot.count({ where: { spaceId } })).toBe(2);
  });

  it("preserves and atomically spends legacy token units through renewal", async () => {
    const bounds = calendarUsagePeriod(now);
    await ensureOrganizationBilling(prisma, organizationId, now);
    await prisma.organizationBilling.update({
      where: { organizationId },
      data: {
        plan: "plus",
        stripeSubscriptionId: `legacy-${organizationId}`,
        inputTokensUsed: 3_999_990,
        currentPeriodStart: bounds.startsAt,
        currentPeriodEnd: bounds.endsAt,
        usageAllowanceStartsAt: bounds.endsAt,
      },
    });
    const metadata = { inputTokenLimit: 4, outputTokenLimit: 2 };
    const outcomes = await Promise.allSettled(
      ["legacy-one", "legacy-two"].map((operationKey) =>
        reserveUsage(prisma, { ...request(operationKey), metadata }),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const admitted = outcomes.find((outcome) => outcome.status === "fulfilled");
    if (admitted?.status !== "fulfilled") throw new Error("No reservation");
    const actual = {
      reservationId: admitted.value.id,
      actualAmountUsd: 0.2,
      usage: { input: 2, output: 1 },
    };
    await Promise.all([settleUsage(prisma, actual), settleUsage(prisma, actual)]);
    expect(await ensureOrganizationBilling(prisma, organizationId, now)).toMatchObject({
      legacyUntil: bounds.endsAt.toISOString(),
      allowanceUsd: 0,
      inputTokensUsed: 3_999_992,
      outputTokensUsed: 1,
    });
  });
});
