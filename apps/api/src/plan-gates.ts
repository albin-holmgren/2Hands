import { gatewayModelTier, VERCEL_GATEWAY_PROVIDER_ID } from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import {
  assertBotLimit,
  assertHarnessAllowed,
  assertModelTierAllowed,
  assertPluginLimit,
  hostedBillingEnabled,
  parseCodingHarness,
} from "@rakazo/core";
import {
  countOrganizationBots,
  countOrganizationPlugins,
  ensureOrganizationBilling,
  findModelCredential,
  organizationIdForSpace,
  type PrismaClient,
} from "@rakazo/db";
import { throwExecutionRpcError } from "./execution-errors.js";

export function throwPlanLimit(error: unknown): never {
  throwExecutionRpcError(error);
}

export async function billingForActor(prisma: PrismaClient, actor: Actor) {
  const organizationId = await organizationIdForSpace(prisma, actor.spaceId);
  return ensureOrganizationBilling(prisma, organizationId);
}

export async function assertCanCreateBot(prisma: PrismaClient, actor: Actor): Promise<void> {
  if (!hostedBillingEnabled(process.env.BILLING_ENABLED)) return;
  try {
    const billing = await billingForActor(prisma, actor);
    const current = await countOrganizationBots(prisma, billing.organizationId);
    assertBotLimit(billing.entitlements, current);
  } catch (error) {
    throwPlanLimit(error);
  }
}

export async function assertCanAddPlugin(prisma: PrismaClient, actor: Actor): Promise<void> {
  if (!hostedBillingEnabled(process.env.BILLING_ENABLED)) return;
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
  if (!hostedBillingEnabled(process.env.BILLING_ENABLED)) return;
  const billing = await billingForActor(prisma, actor);
  try {
    if (input.codingHarness !== undefined) {
      assertHarnessAllowed(billing.entitlements, parseCodingHarness(input.codingHarness));
    }
    if (input.modelProvider === VERCEL_GATEWAY_PROVIDER_ID && input.modelId) {
      const ownCredential = await findModelCredential(prisma, actor, input.modelProvider);
      if (!ownCredential)
        assertModelTierAllowed(billing.entitlements, gatewayModelTier(input.modelId));
    }
  } catch (error) {
    throwPlanLimit(error);
  }
}

export function platformGatewayConfigured(deploymentModelKey?: string, provider?: string | null) {
  return provider === VERCEL_GATEWAY_PROVIDER_ID && Boolean(deploymentModelKey);
}
