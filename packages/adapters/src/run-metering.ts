import { randomUUID } from "node:crypto";
import type { AgentRunRequest } from "@rakazo/adapter-kit";
import { assertModelTierAllowed, hostedBillingEnabled } from "@rakazo/core";
import {
  ensureOrganizationBilling,
  organizationIdForSpace,
  type PrismaClient,
  releaseUsage,
  reserveUsage,
  settleUsage,
} from "@rakazo/db";
import { gatewayModelTier } from "./vercel-gateway-provider.js";

export function createModelMeter(
  prisma: PrismaClient,
  scope: {
    userId: string;
    spaceId: string;
    runId?: string;
  },
  funding: "hosted" | "byok",
): AgentRunRequest["meterModelCall"] {
  if (!hostedBillingEnabled(process.env.BILLING_ENABLED) || funding === "byok") return undefined;
  return async ({ provider, model, inputTokenLimit, outputTokenLimit, rates: modelRates }) => {
    if (provider === "scripted" || provider === "local") {
      return { settle: async () => {}, release: async () => {} };
    }
    const rates = { ...modelRates };
    if (
      ![inputTokenLimit, outputTokenLimit].every(
        (limit) => Number.isSafeInteger(limit) && limit >= 0,
      )
    ) {
      throw new Error(
        "MODEL_UNAVAILABLE: A bounded token limit is required for this hosted model.",
      );
    }
    if (
      ![rates.input, rates.output, rates.cacheRead, rates.cacheWrite].every(
        (rate) => Number.isFinite(rate) && rate >= 0,
      ) ||
      rates.input + rates.output <= 0
    ) {
      throw new Error("MODEL_UNAVAILABLE: Pricing is unavailable for this hosted model.");
    }
    const organizationId = await organizationIdForSpace(prisma, scope.spaceId);
    const billing = await ensureOrganizationBilling(prisma, organizationId);
    // Free admission is based on the selected model, never on a client-provided tier.
    const tier =
      provider === "vercel-gateway"
        ? gatewayModelTier(model)
        : rates.input <= 2 && rates.output <= 6
          ? "cheap"
          : "frontier";
    assertModelTierAllowed(billing.entitlements, tier);
    const maxInputRate = Math.max(rates.input, rates.cacheRead, rates.cacheWrite);
    const reservation = await reserveUsage(prisma, {
      ...scope,
      organizationId,
      operationKey: `model:${scope.runId ?? "background"}:${randomUUID()}`,
      amountUsd: (inputTokenLimit * maxInputRate + outputTokenLimit * rates.output) / 1_000_000,
      kind: "ai",
      funding,
      metadata: { provider, model, rates, inputTokenLimit, outputTokenLimit },
    });
    return {
      settle: async (usage) => {
        const counts = [usage.input, usage.output, usage.cacheRead, usage.cacheWrite];
        // SDKs may initialize usage to zero when a provider omits its final
        // report. That is an unknown outcome, not evidence of a free request.
        if (
          !counts.every((count) => Number.isFinite(count) && count >= 0) ||
          counts.reduce((sum, count) => sum + count, 0) <= 0
        ) {
          throw new Error("Model usage could not be confirmed. Its reservation is retained.");
        }
        const actualAmountUsd =
          (usage.input * rates.input +
            usage.output * rates.output +
            usage.cacheRead * rates.cacheRead +
            usage.cacheWrite * rates.cacheWrite) /
          1_000_000;
        await settleUsage(prisma, {
          reservationId: reservation.id,
          actualAmountUsd,
          usage: { ...usage, provider, model, rates },
        });
      },
      release: async () => releaseUsage(prisma, { reservationId: reservation.id }),
    };
  };
}
