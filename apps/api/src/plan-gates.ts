import { ORPCError } from "@orpc/server";
import { gatewayModelTier, VERCEL_GATEWAY_PROVIDER_ID } from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import {
  assertBotLimit,
  assertHarnessAllowed,
  assertModelTierAllowed,
  assertPluginLimit,
  parseCodingHarness,
  PlanLimitError,
} from "@rakazo/core";
import {
  countOrganizationBots,
  countOrganizationPlugins,
  ensureOrganizationBilling,
  organizationIdForSpace,
  type PrismaClient,
} from "@rakazo/db";

export function throwPlanLimit(error: unknown): never {
  if (error instanceof PlanLimitError) {
    throw new ORPCError("FORBIDDEN", { message: error.message });
  }
  throw error;
}

export async function billingForActor(prisma: PrismaClient, actor: Actor) {
  const organizationId = await organizationIdForSpace(prisma, actor.spaceId);
  return ensureOrganizationBilling(prisma, organizationId);
}

export async function assertCanCreateBot(prisma: PrismaClient, actor: Actor): Promise<void> {
  try {
    const billing = await billingForActor(prisma, actor);
    const current = await countOrganizationBots(prisma, billing.organizationId);
    assertBotLimit(billing.entitlements, current);
  } catch (error) {
    throwPlanLimit(error);
  }
}

export async function assertCanAddPlugin(prisma: PrismaClient, actor: Actor): Promise<void> {
  try {
    const billing = await billingForActor(prisma, actor);
    const current = await countOrganizationPlugins(prisma, billing.organizationId);
    assertPluginLimit(billing.entitlements, current);
  } catch (error) {
    throwPlanLimit(error);
  }
}

export async function assertBotModelAndHarness(
  prisma: PrismaClient,
  actor: Actor,
  input: {
    modelProvider?: string | null;
    modelId?: string | null;
    codingHarness?: string | null;
  },
): Promise<void> {
  const billing = await billingForActor(prisma, actor).catch(() => null);
  if (!billing) return;
  try {
    if (input.codingHarness !== undefined) {
      assertHarnessAllowed(billing.entitlements, parseCodingHarness(input.codingHarness));
    }
    if (input.modelProvider === VERCEL_GATEWAY_PROVIDER_ID && input.modelId) {
      assertModelTierAllowed(billing.entitlements, gatewayModelTier(input.modelId));
    }
  } catch (error) {
    throwPlanLimit(error);
  }
}

export function platformGatewayConfigured(deploymentModelKey?: string, provider?: string | null) {
  return provider === VERCEL_GATEWAY_PROVIDER_ID && Boolean(deploymentModelKey);
}
