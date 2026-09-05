import { CHIEF_OF_STAFF_SPAWN_KEY } from "@rakazo/core";
import { ensureUsagePeriod, microsToUsd, withBillingLock } from "./billing-ledger.js";
import type { PrismaClient } from "./client.js";

export async function ensureOrganizationBilling(
  prisma: PrismaClient,
  organizationId: string,
  now = new Date(),
) {
  return withBillingLock(prisma, organizationId, async (tx, row) => {
    const { period, terms } = await ensureUsagePeriod(tx, row, now);
    const samePeriod = row.usagePeriodStart.getTime() === period.startsAt.getTime();
    const remaining = period.allowanceMicros - period.spentMicros - period.reservedMicros;
    return {
      organizationId: row.organizationId,
      plan: terms.plan,
      entitlements: terms.entitlements,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      status: row.status,
      currentPeriodEnd: row.currentPeriodEnd,
      computerSecondsUsed: samePeriod ? row.computerSecondsUsed : 0,
      inputTokensUsed: samePeriod ? row.inputTokensUsed : 0,
      outputTokensUsed: samePeriod ? row.outputTokensUsed : 0,
      usagePeriodStart: period.startsAt,
      legacyUntil: terms.legacyUntil,
      allowanceUsd: microsToUsd(period.allowanceMicros),
      spentUsd: microsToUsd(period.spentMicros),
      reservedUsd: microsToUsd(period.reservedMicros),
      remainingUsd: microsToUsd(remaining > 0n ? remaining : 0n),
      resetAt: period.endsAt.toISOString(),
      exhausted: terms.legacyUntil
        ? row.inputTokensUsed + row.outputTokensUsed >= terms.entitlements.monthlyTokens &&
          row.computerSecondsUsed >= terms.entitlements.computerHours * 3600
        : remaining <= 0n,
    };
  });
}

export async function organizationIdForSpace(
  prisma: PrismaClient,
  spaceId: string,
): Promise<string> {
  const space = await prisma.space.findUniqueOrThrow({
    where: { id: spaceId },
    select: { organizationId: true },
  });
  return space.organizationId;
}

export async function recordTokenUsage(
  prisma: PrismaClient,
  organizationId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await prisma.organizationBilling.update({
    where: { organizationId },
    data: {
      inputTokensUsed: { increment: inputTokens },
      outputTokensUsed: { increment: outputTokens },
    },
  });
}

export async function countOrganizationBots(
  prisma: Pick<PrismaClient, "space" | "bot">,
  organizationId: string,
): Promise<number> {
  const spaces = await prisma.space.findMany({
    where: { organizationId },
    select: { id: true },
  });
  return prisma.bot.count({
    where: {
      spaceId: { in: spaces.map((space) => space.id) },
      archivedAt: null,
      OR: [{ spawnKey: null }, { spawnKey: { not: CHIEF_OF_STAFF_SPAWN_KEY } }],
    },
  });
}

export async function countOrganizationPlugins(
  prisma: PrismaClient,
  organizationId: string,
): Promise<number> {
  const spaces = await prisma.space.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const spaceIds = spaces.map((space) => space.id);
  const [connections, servers] = await Promise.all([
    prisma.connection.count({
      where: { spaceId: { in: spaceIds }, status: { not: "revoked" } },
    }),
    prisma.mcpServer.count({ where: { spaceId: { in: spaceIds } } }),
  ]);
  return connections + servers;
}
