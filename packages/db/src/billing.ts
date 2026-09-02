import {
  type PlanId,
  parsePlanId,
  PLANS,
  type PlanEntitlements,
} from "@rakazo/core";
import type { PrismaClient } from "./client.js";

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export async function ensureOrganizationBilling(
  prisma: PrismaClient,
  organizationId: string,
): Promise<{
  organizationId: string;
  plan: PlanId;
  entitlements: PlanEntitlements;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
  computerSecondsUsed: number;
  inputTokensUsed: number;
  outputTokensUsed: number;
  usagePeriodStart: Date;
}> {
  const existing = await prisma.organizationBilling.findUnique({
    where: { organizationId },
  });
  const row =
    existing ??
    (await prisma.organizationBilling.create({
      data: { organizationId, plan: "free", usagePeriodStart: new Date() },
    }));
  const reset = await maybeResetUsagePeriod(prisma, row);
  const current = reset ?? row;
  const plan = parsePlanId(current.plan);
  return {
    organizationId: current.organizationId,
    plan,
    entitlements: PLANS[plan],
    stripeCustomerId: current.stripeCustomerId,
    stripeSubscriptionId: current.stripeSubscriptionId,
    status: current.status,
    currentPeriodEnd: current.currentPeriodEnd,
    computerSecondsUsed: current.computerSecondsUsed,
    inputTokensUsed: current.inputTokensUsed,
    outputTokensUsed: current.outputTokensUsed,
    usagePeriodStart: current.usagePeriodStart,
  };
}

async function maybeResetUsagePeriod(
  prisma: PrismaClient,
  row: {
    organizationId: string;
    usagePeriodStart: Date;
    currentPeriodEnd: Date | null;
  },
) {
  const boundary = row.currentPeriodEnd ?? new Date(row.usagePeriodStart.getTime() + PERIOD_MS);
  if (boundary > new Date()) return null;
  return prisma.organizationBilling.update({
    where: { organizationId: row.organizationId },
    data: {
      usagePeriodStart: new Date(),
      computerSecondsUsed: 0,
      inputTokensUsed: 0,
      outputTokensUsed: 0,
    },
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
  prisma: PrismaClient,
  organizationId: string,
): Promise<number> {
  const spaces = await prisma.space.findMany({
    where: { organizationId },
    select: { id: true },
  });
  return prisma.bot.count({
    where: { spaceId: { in: spaces.map((space) => space.id) }, archivedAt: null },
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
