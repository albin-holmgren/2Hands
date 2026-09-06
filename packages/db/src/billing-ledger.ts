import { PLANS, PlanLimitError, parsePlanId } from "@rakazo/core";
import type { OrganizationBilling, Prisma, PrismaClient, UsageReservation } from "./client.js";
import { IsolationError } from "./scope.js";
import { withTransactionRetry } from "./transaction-retry.js";

const MICROS_PER_USD = 1_000_000;

/** Round reservations and incurred costs upwards so fractional cents are never free. */
export function usdToMicros(amountUsd: number): bigint {
  if (!Number.isFinite(amountUsd) || amountUsd < 0 || amountUsd > 1_000_000) {
    throw new Error("Usage amount must be a finite, non-negative USD amount at most 1,000,000");
  }
  return BigInt(Math.ceil(amountUsd * MICROS_PER_USD));
}

export function microsToUsd(micros: bigint): number {
  return Number(micros) / MICROS_PER_USD;
}

export function calendarUsagePeriod(now: Date): { startsAt: Date; endsAt: Date } {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid billing date");
  return {
    startsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    endsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export function currentBillingTerms(row: OrganizationBilling, now: Date) {
  const storedPlan = parsePlanId(row.plan);
  const subscriptionActive = row.status === "active" || row.status === "trialing";
  const legacy =
    storedPlan !== "free" &&
    subscriptionActive &&
    Boolean(row.usageAllowanceStartsAt && row.usageAllowanceStartsAt > now);
  const periodStart = legacy ? row.usagePeriodStart : row.currentPeriodStart;
  const paidPeriodCurrent = Boolean(
    periodStart && row.currentPeriodEnd && periodStart <= now && now < row.currentPeriodEnd,
  );
  const paid = storedPlan !== "free";
  const plan = paid && (!subscriptionActive || !paidPeriodCurrent) ? "free" : storedPlan;
  const bounds =
    paid && paidPeriodCurrent
      ? { startsAt: periodStart!, endsAt: row.currentPeriodEnd! }
      : calendarUsagePeriod(now);
  const entitlements = { ...PLANS[plan] };
  if (legacy && plan === "plus") entitlements.modelTiers = ["cheap", "mid"];
  if (legacy && plan === "pro") entitlements.modelTiers = ["cheap", "mid", "frontier"];
  return {
    plan,
    entitlements,
    legacyUntil: legacy && paidPeriodCurrent ? row.usageAllowanceStartsAt!.toISOString() : null,
    // Existing subscriptions transition at renewal; a delayed renewal cannot invent allowance.
    allowanceMicros: usdToMicros(
      legacy || (paid && (!subscriptionActive || !paidPeriodCurrent))
        ? 0
        : PLANS[plan].allowanceUsd,
    ),
    ...bounds,
  };
}

/** All allowance changes serialize on this row, including first creation and webhooks. */
export async function withBillingLock<T>(
  prisma: PrismaClient,
  organizationId: string,
  operation: (tx: Prisma.TransactionClient, billing: OrganizationBilling) => Promise<T>,
  options?: { timeoutMs: number },
): Promise<T> {
  return withTransactionRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const billing = await lockBillingRow(tx, organizationId);
        return operation(tx, billing);
      },
      options ? { timeout: options.timeoutMs } : undefined,
    ),
  );
}

export async function lockBillingRow(tx: Prisma.TransactionClient, organizationId: string) {
  // Prisma's empty-update upsert can fall back to find/create and race on the first row.
  await tx.$executeRaw`INSERT INTO "organization_billing" ("organizationId", "updatedAt") VALUES (${organizationId}, CURRENT_TIMESTAMP) ON CONFLICT ("organizationId") DO NOTHING`;
  await tx.$queryRaw`SELECT "organizationId" FROM "organization_billing" WHERE "organizationId" = ${organizationId} FOR UPDATE`;
  return tx.organizationBilling.findUniqueOrThrow({ where: { organizationId } });
}

export async function ensureUsagePeriod(
  tx: Prisma.TransactionClient,
  billing: OrganizationBilling,
  now: Date,
) {
  const terms = currentBillingTerms(billing, now);
  const period = await tx.billingPeriod.upsert({
    where: {
      organizationId_startsAt: { organizationId: billing.organizationId, startsAt: terms.startsAt },
    },
    create: {
      organizationId: billing.organizationId,
      startsAt: terms.startsAt,
      endsAt: terms.endsAt,
      allowanceMicros: terms.allowanceMicros,
    },
    // Plan changes alter the allowance, never the amount already spent or held.
    update: { allowanceMicros: terms.allowanceMicros, endsAt: terms.endsAt },
  });
  if (billing.usagePeriodStart.getTime() !== period.startsAt.getTime()) {
    await tx.organizationBilling.update({
      where: { organizationId: billing.organizationId },
      data: {
        usagePeriodStart: period.startsAt,
        inputTokensUsed: 0,
        outputTokensUsed: 0,
        computerSecondsUsed: 0,
      },
    });
  }
  return { period, terms };
}

export type UsageKind = "ai" | "computer" | "harness";
export type UsageFunding = "hosted" | "byok";
export type UsageMetadata = Prisma.InputJsonObject;

export interface ReserveUsageInput {
  organizationId: string;
  spaceId: string;
  userId: string;
  runId?: string;
  operationKey: string;
  amountUsd: number;
  kind: UsageKind;
  funding: UsageFunding;
  metadata?: UsageMetadata;
  now?: Date;
}

function reservationDto(row: UsageReservation) {
  return {
    id: row.id,
    amountUsd: microsToUsd(row.reservedMicros),
    status: row.status as "reserved" | "settled" | "released",
    billable: !(row.kind === "ai" && row.funding === "byok"),
  };
}

/** Reserve a bounded cost BEFORE dispatch. Reusing an operation key never reserves twice. */
export async function reserveUsage(prisma: PrismaClient, input: ReserveUsageInput) {
  return withBillingLock(prisma, input.organizationId, (tx, billing) =>
    reserveUsageInTransaction(tx, billing, input),
  );
}

/** Caller must already hold the organization billing lock. */
export async function reserveUsageInTransaction(
  tx: Prisma.TransactionClient,
  billing: OrganizationBilling,
  input: ReserveUsageInput,
) {
  const requestedMicros = usdToMicros(input.amountUsd);
  if (!input.operationKey.trim() || input.operationKey.length > 300)
    throw new Error("Invalid usage operation key");
  if (
    !["ai", "computer", "harness"].includes(input.kind) ||
    !["hosted", "byok"].includes(input.funding)
  )
    throw new Error("Invalid usage source");
  const reservedMicros = input.kind === "ai" && input.funding === "byok" ? 0n : requestedMicros;
  const member = await tx.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: input.spaceId, userId: input.userId } },
    select: { organizationId: true },
  });
  if (member?.organizationId !== input.organizationId) throw new IsolationError();
  if (input.runId) {
    const run = await tx.run.findFirst({
      where: { id: input.runId, spaceId: input.spaceId, userId: input.userId },
      select: { id: true },
    });
    if (!run) throw new IsolationError();
  }
  const existing = await tx.usageReservation.findUnique({
    where: {
      organizationId_operationKey: {
        organizationId: input.organizationId,
        operationKey: input.operationKey,
      },
    },
  });
  if (existing) {
    if (
      existing.spaceId !== input.spaceId ||
      existing.userId !== input.userId ||
      existing.runId !== (input.runId ?? null) ||
      existing.kind !== input.kind ||
      existing.funding !== input.funding ||
      existing.reservedMicros !== reservedMicros
    ) {
      throw new Error("Usage operation key was reused with different inputs");
    }
    return reservationDto(existing);
  }
  const { period, terms } = await ensureUsagePeriod(tx, billing, input.now ?? new Date());
  const legacy = terms.legacyUntil && !(input.kind === "ai" && input.funding === "byok");
  const legacyLimits = legacy
    ? await assertLegacyUsageAvailable(tx, billing, period.id, input, terms.entitlements)
    : {};
  if (
    !legacy &&
    reservedMicros > 0n &&
    reservedMicros > period.allowanceMicros - period.spentMicros - period.reservedMicros
  ) {
    throw new PlanLimitError(
      "Your included usage is used up. Upgrade or wait for the next period.",
      "ALLOWANCE_EXHAUSTED",
    );
  }
  const row = await tx.usageReservation.create({
    data: {
      organizationId: input.organizationId,
      periodId: period.id,
      spaceId: input.spaceId,
      userId: input.userId,
      runId: input.runId,
      operationKey: input.operationKey,
      kind: input.kind,
      funding: input.funding,
      reservedMicros,
      metadata: {
        ...input.metadata,
        _usagePeriodStart: period.startsAt.toISOString(),
        ...legacyLimits,
      },
    },
  });
  if (reservedMicros > 0n)
    await tx.billingPeriod.update({
      where: { id: period.id },
      data: { reservedMicros: { increment: reservedMicros } },
    });
  return reservationDto(row);
}

/** Idempotently settle actual incurred cost against its ORIGINAL period, including late usage. */
export interface SettleUsageInput {
  reservationId: string;
  actualAmountUsd: number;
  usage?: UsageMetadata;
  now?: Date;
}

export async function settleUsage(prisma: PrismaClient, input: SettleUsageInput): Promise<void> {
  const reservation = await prisma.usageReservation.findUniqueOrThrow({
    where: { id: input.reservationId },
  });
  await withBillingLock(prisma, reservation.organizationId, (tx) =>
    settleUsageInTransaction(tx, input),
  );
}

/** Caller must already hold the organization billing lock. */
export async function settleUsageInTransaction(
  tx: Prisma.TransactionClient,
  input: SettleUsageInput,
): Promise<void> {
  const amount = usdToMicros(input.actualAmountUsd);
  const row = await tx.usageReservation.findUniqueOrThrow({ where: { id: input.reservationId } });
  const actualMicros = row.kind === "ai" && row.funding === "byok" ? 0n : amount;
  if (row.status === "settled") {
    if (row.settledMicros !== actualMicros)
      throw new Error("Usage settlement was repeated with a different amount");
    return;
  }
  await recordSettledUnits(tx, row, input.usage);
  await tx.usageReservation.update({
    where: { id: row.id },
    data: {
      status: "settled",
      settledMicros: actualMicros,
      settledAt: input.now ?? new Date(),
      metadata: { ...metadataObject(row.metadata), ...input.usage },
    },
  });
  await tx.billingPeriod.update({
    where: { id: row.periodId },
    data: {
      spentMicros: { increment: actualMicros },
      reservedMicros: { decrement: row.status === "reserved" ? row.reservedMicros : 0n },
    },
  });
}

function metadataObject(value: unknown): Prisma.InputJsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.InputJsonObject)
    : {};
}

function nonNegativeUnits(value: unknown, required = false): number {
  if (value === undefined && !required) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000_000)
    throw new Error("Usage unit count is unavailable or invalid");
  return Math.ceil(value);
}

async function assertLegacyUsageAvailable(
  tx: Prisma.TransactionClient,
  billing: OrganizationBilling,
  periodId: string,
  input: ReserveUsageInput,
  plan: ReturnType<typeof currentBillingTerms>["entitlements"],
) {
  const held = await tx.usageReservation.findMany({
    where: { periodId, status: "reserved" },
    select: { metadata: true },
  });
  const metadata = metadataObject(input.metadata);
  if (input.kind === "ai") {
    const limit =
      nonNegativeUnits(metadata.inputTokenLimit, true) +
      nonNegativeUnits(metadata.outputTokenLimit, true);
    const reserved = held.reduce(
      (sum, row) => sum + nonNegativeUnits(metadataObject(row.metadata)._legacyTokenLimit),
      0,
    );
    if (billing.inputTokensUsed + billing.outputTokensUsed + reserved + limit > plan.monthlyTokens)
      throw new PlanLimitError(
        "Your current token allowance is used up. It renews on your next billing date.",
        "ALLOWANCE_EXHAUSTED",
      );
    return { _legacyTokenLimit: limit };
  }
  if (input.kind === "computer") {
    const limit = nonNegativeUnits(metadata.computerSecondsLimit, true);
    const reserved = held.reduce(
      (sum, row) =>
        sum + nonNegativeUnits(metadataObject(row.metadata)._legacyComputerSecondsLimit),
      0,
    );
    if (billing.computerSecondsUsed + reserved + limit > plan.computerHours * 3600)
      throw new PlanLimitError(
        "Your current computer allowance is used up. It renews on your next billing date.",
        "ALLOWANCE_EXHAUSTED",
      );
    return { _legacyComputerSecondsLimit: limit };
  }
  throw new Error("This usage source is unavailable on the legacy allowance.");
}

async function recordSettledUnits(
  tx: Prisma.TransactionClient,
  row: UsageReservation,
  usage?: UsageMetadata,
) {
  if (row.kind === "ai" && row.funding === "byok") return;
  const reserved = metadataObject(row.metadata);
  const actual = metadataObject(usage);
  const legacyTokens = reserved._legacyTokenLimit !== undefined;
  const legacyComputer = reserved._legacyComputerSecondsLimit !== undefined;
  const input =
    nonNegativeUnits(actual.inputTokens ?? actual.input, legacyTokens) +
    nonNegativeUnits(actual.cacheReadTokens ?? actual.cacheRead) +
    nonNegativeUnits(actual.cacheWriteTokens ?? actual.cacheWrite);
  const output = nonNegativeUnits(actual.outputTokens ?? actual.output, legacyTokens);
  const seconds = nonNegativeUnits(
    actual.elapsedMs === undefined ? undefined : nonNegativeUnits(actual.elapsedMs) / 1000,
    legacyComputer,
  );
  if (!input && !output && !seconds) return;
  const billing = await tx.organizationBilling.findUniqueOrThrow({
    where: { organizationId: row.organizationId },
  });
  if (billing.usagePeriodStart.toISOString() !== reserved._usagePeriodStart) return;
  await tx.organizationBilling.update({
    where: { organizationId: row.organizationId },
    data: {
      inputTokensUsed: { increment: input },
      outputTokensUsed: { increment: output },
      computerSecondsUsed: { increment: seconds },
    },
  });
}

/** Release only work known not to have spent. Settled work can never be refunded by retry. */
export async function releaseUsage(
  prisma: PrismaClient,
  input: { reservationId: string; now?: Date },
): Promise<void> {
  const reservation = await prisma.usageReservation.findUniqueOrThrow({
    where: { id: input.reservationId },
  });
  await withBillingLock(prisma, reservation.organizationId, async (tx) => {
    const row = await tx.usageReservation.findUniqueOrThrow({ where: { id: input.reservationId } });
    if (row.status !== "reserved") return;
    await tx.usageReservation.update({
      where: { id: row.id },
      data: { status: "released", releasedAt: input.now ?? new Date() },
    });
    await tx.billingPeriod.update({
      where: { id: row.periodId },
      data: { reservedMicros: { decrement: row.reservedMicros } },
    });
  });
}
