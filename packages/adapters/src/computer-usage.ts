import { randomUUID } from "node:crypto";
import type { AdapterContext, JobPublisher, SandboxProvider } from "@rakazo/adapter-kit";
import { ExecutionError, hostedBillingEnabled, PlanLimitError } from "@rakazo/core";
import {
  type Computer,
  currentBillingTerms,
  microsToUsd,
  organizationIdForSpace,
  type Prisma,
  type PrismaClient,
  reserveUsageInTransaction,
  settleUsageInTransaction,
  usdToMicros,
  withBillingLock,
} from "@rakazo/db";
import { toComputerRef } from "./computer-support.js";

export const HOSTED_COMPUTER_LEASE_MS = 5 * 60_000;
const RENEW_BEFORE_MS = 30_000;

export function hostedComputerRate(value = process.env.HOSTED_COMPUTER_USD_PER_HOUR): number {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1_000) {
    throw new ExecutionError("COMPUTER_UNAVAILABLE", "Hosted computer pricing is not configured.");
  }
  return rate;
}

/** One prepaid interval per shared computer; every caller reuses its existing coverage. */
export async function ensureComputerUsageCoverage(
  deps: { prisma: PrismaClient; sandbox: SandboxProvider },
  computerId: string,
  now = new Date(),
): Promise<string | undefined> {
  if (!hostedBillingEnabled(process.env.BILLING_ENABLED)) return undefined;
  if (!deps.sandbox.describe().capabilities.boundedLifetime) {
    throw new ExecutionError(
      "COMPUTER_UNAVAILABLE",
      "This computer provider cannot enforce hosted usage limits.",
    );
  }
  const rate = hostedComputerRate();
  const computer = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
  const organizationId = await organizationIdForSpace(deps.prisma, computer.spaceId);
  return withBillingLock(deps.prisma, organizationId, async (tx, billing) => {
    const current = await tx.computer.findUniqueOrThrow({ where: { id: computerId } });
    if (current.state !== "running" && current.state !== "booting")
      throw new ExecutionError(
        "COMPUTER_UNAVAILABLE",
        "Start the computer before renewing its usage.",
      );
    if (
      current.billingReservationId &&
      current.billingCoveredUntil &&
      current.billingCoveredUntil.getTime() > now.getTime() + RENEW_BEFORE_MS
    ) {
      return current.billingCoveredUntil.toISOString();
    }
    if (
      current.billingReservationId &&
      current.billingStartedAt &&
      current.billingCoveredUntil &&
      current.billingRateMicrosPerHour !== null
    ) {
      const elapsedMs = Math.max(
        0,
        Math.min(now.getTime(), current.billingCoveredUntil.getTime()) -
          current.billingStartedAt.getTime(),
      );
      await settleUsageInTransaction(tx, {
        reservationId: current.billingReservationId,
        actualAmountUsd: (microsToUsd(current.billingRateMicrosPerHour) * elapsedMs) / 3_600_000,
        usage: {
          computerId,
          elapsedMs,
          rateUsdPerHour: microsToUsd(current.billingRateMicrosPerHour),
        },
        now,
      });
    }
    const parallel = await tx.computer.count({
      where: {
        id: { not: computerId },
        space: { organizationId },
        billingCoveredUntil: { gt: now },
      },
    });
    if (parallel >= currentBillingTerms(billing, now).entitlements.maxParallelScreens) {
      throw new PlanLimitError("Your plan's parallel computer limit is reached.");
    }
    const expiresAt = new Date(now.getTime() + HOSTED_COMPUTER_LEASE_MS);
    const reservation = await reserveUsageInTransaction(tx, billing, {
      organizationId,
      spaceId: current.spaceId,
      userId: current.userId,
      operationKey: `computer:${computerId}:${randomUUID()}`,
      kind: "computer",
      funding: "hosted",
      amountUsd: (rate * HOSTED_COMPUTER_LEASE_MS) / 3_600_000,
      metadata: {
        computerId,
        rateUsdPerHour: rate,
        coveredUntil: expiresAt.toISOString(),
        computerSecondsLimit: HOSTED_COMPUTER_LEASE_MS / 1000,
      },
      now,
    });
    await tx.computer.update({
      where: { id: computerId },
      data: {
        billingReservationId: reservation.id,
        billingStartedAt: now,
        billingCoveredUntil: expiresAt,
        billingRateMicrosPerHour: usdToMicros(rate),
      },
    });
    return expiresAt.toISOString();
  });
}

/** Call after a confirmed stop, or after the provider-enforced deadline has elapsed. */
export async function settleComputerUsage(
  prisma: PrismaClient,
  computerId: string,
  now = new Date(),
): Promise<void> {
  return finishComputerUsage(prisma, computerId, now);
}

/** Undo only newly reserved coverage when provisioning has not reached the provider. */
export async function releaseUnusedComputerUsage(
  prisma: PrismaClient,
  computerId: string,
  previousReservationId: string | null,
  now = new Date(),
): Promise<void> {
  return finishComputerUsage(prisma, computerId, now, previousReservationId);
}

async function finishComputerUsage(
  prisma: PrismaClient,
  computerId: string,
  now: Date,
  unusedAfterReservationId?: string | null,
): Promise<void> {
  if (!hostedBillingEnabled(process.env.BILLING_ENABLED)) return;
  const computer = await prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
  if (!computer.billingReservationId) return;
  const organizationId = await organizationIdForSpace(prisma, computer.spaceId);
  await withBillingLock(prisma, organizationId, async (tx) => {
    const current = await tx.computer.findUniqueOrThrow({ where: { id: computerId } });
    await finishComputerUsageInTransaction(tx, current, now, unusedAfterReservationId);
  });
}

async function finishComputerUsageInTransaction(
  tx: Prisma.TransactionClient,
  current: Computer,
  now: Date,
  unusedAfterReservationId?: string | null,
) {
  if (
    !current.billingReservationId ||
    !current.billingStartedAt ||
    !current.billingCoveredUntil ||
    current.billingRateMicrosPerHour === null
  )
    return;
  if (current.billingReservationId === unusedAfterReservationId) return;
  const elapsedMs =
    unusedAfterReservationId !== undefined
      ? 0
      : Math.max(
          0,
          Math.min(now.getTime(), current.billingCoveredUntil.getTime()) -
            current.billingStartedAt.getTime(),
        );
  await settleUsageInTransaction(tx, {
    reservationId: current.billingReservationId,
    actualAmountUsd: (microsToUsd(current.billingRateMicrosPerHour) * elapsedMs) / 3_600_000,
    usage: {
      computerId: current.id,
      elapsedMs,
      rateUsdPerHour: microsToUsd(current.billingRateMicrosPerHour),
    },
    now,
  });
  await tx.computer.update({
    where: { id: current.id },
    data: {
      billingReservationId: null,
      billingStartedAt: null,
      billingCoveredUntil: null,
      billingRateMicrosPerHour: null,
    },
  });
}

/** Fail closed on missing allowance or DB failure; retain reservations if stopping is uncertain. */
export async function suspendComputerForBudget(
  deps: { prisma: PrismaClient; sandbox: SandboxProvider; jobs?: JobPublisher },
  computerId: string,
): Promise<void> {
  const computer = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
  if (
    (!computer.providerRef || computer.state === "booting") &&
    computer.billingReservationId &&
    computer.billingCoveredUntil &&
    computer.billingCoveredUntil.getTime() > Date.now()
  ) {
    throw new Error("Computer provisioning outcome is unknown until its prepaid deadline.");
  }
  const organizationId = await organizationIdForSpace(deps.prisma, computer.spaceId);
  await withBillingLock(
    deps.prisma,
    organizationId,
    async (tx) => {
      // Claim the exact generation observed by this cleanup. Renewals use the same
      // billing lock, and the computer row remains locked through provider stop and
      // settlement, so Boot cannot install a new hold beneath an old expiry job.
      const claimed = await tx.computer.updateMany({
        where: {
          id: computerId,
          providerRef: computer.providerRef,
          executionFence: computer.executionFence,
          billingReservationId: computer.billingReservationId,
          billingCoveredUntil: computer.billingCoveredUntil,
          state: computer.state,
        },
        data: { state: "suspending" },
      });
      if (claimed.count !== 1) return;
      const current = await tx.computer.findUniqueOrThrow({ where: { id: computerId } });
      if (computer.providerRef) {
        const context: AdapterContext = {
          operationId: "computer.budget",
          traceId: "computer.budget",
          userId: computer.userId,
          spaceId: computer.spaceId,
          signal: new AbortController().signal,
        };
        try {
          await deps.sandbox.stop(toComputerRef(computer), context);
        } catch (error) {
          // The bounded provider has already stopped spending after this deadline.
          if (!computer.billingCoveredUntil || computer.billingCoveredUntil.getTime() > Date.now())
            throw error;
        }
      }
      // This transaction still owns both row locks and exactly this reservation.
      if (hostedBillingEnabled(process.env.BILLING_ENABLED))
        await finishComputerUsageInTransaction(tx, current, new Date());
      await tx.computer.update({
        where: { id: computerId },
        data: {
          state: "suspended",
          controlHolder: "none",
          controlLeaseId: null,
          controlLeaseExpiresAt: null,
          controlBotId: null,
          controlRunId: null,
        },
      });
    },
    { timeoutMs: 30_000 },
  );
}
