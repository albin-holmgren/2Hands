export const PLAN_IDS = ["free", "plus", "pro", "ultra"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const CODING_HARNESSES = ["none", "cursor", "claude", "codex"] as const;
export type CodingHarness = (typeof CODING_HARNESSES)[number];

export const MODEL_TIERS = ["cheap", "mid", "frontier", "ultra"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export type PlanEntitlements = {
  id: PlanId;
  name: string;
  priceUsd: number;
  maxBots: number;
  harnesses: Exclude<CodingHarness, "none">[];
  maxPlugins: number;
  modelTiers: ModelTier[];
  monthlyTokens: number;
  computerHours: number;
  maxParallelScreens: number;
};

export const PLANS: Record<PlanId, PlanEntitlements> = {
  free: {
    id: "free",
    name: "Free",
    priceUsd: 0,
    maxBots: 1,
    harnesses: [],
    maxPlugins: 1,
    modelTiers: ["cheap"],
    monthlyTokens: 200_000,
    computerHours: 5,
    maxParallelScreens: 1,
  },
  plus: {
    id: "plus",
    name: "Plus",
    priceUsd: 20,
    maxBots: 3,
    harnesses: ["codex"],
    maxPlugins: 10,
    modelTiers: ["cheap", "mid"],
    monthlyTokens: 4_000_000,
    computerHours: 40,
    maxParallelScreens: 2,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsd: 60,
    maxBots: 10,
    harnesses: ["codex", "claude"],
    maxPlugins: Number.POSITIVE_INFINITY,
    modelTiers: ["cheap", "mid", "frontier"],
    monthlyTokens: 20_000_000,
    computerHours: 150,
    maxParallelScreens: 5,
  },
  ultra: {
    id: "ultra",
    name: "Ultra",
    priceUsd: 200,
    maxBots: 100,
    harnesses: ["codex", "claude", "cursor"],
    maxPlugins: Number.POSITIVE_INFINITY,
    modelTiers: ["cheap", "mid", "frontier", "ultra"],
    monthlyTokens: 80_000_000,
    computerHours: 500,
    maxParallelScreens: 10,
  },
};

export function isPlanId(value: string | null | undefined): value is PlanId {
  return PLAN_IDS.includes(value as PlanId);
}

export function parsePlanId(value: string | null | undefined): PlanId {
  return isPlanId(value) ? value : "free";
}

export function isCodingHarness(value: string | null | undefined): value is CodingHarness {
  return CODING_HARNESSES.includes(value as CodingHarness);
}

export function parseCodingHarness(value: string | null | undefined): CodingHarness {
  return isCodingHarness(value) ? value : "none";
}

export class PlanLimitError extends Error {
  readonly code = "PLAN_LIMIT";
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export function assertBotLimit(plan: PlanEntitlements, currentBots: number): void {
  if (currentBots >= plan.maxBots) {
    throw new PlanLimitError(
      `${plan.name} includes ${plan.maxBots} bot${plan.maxBots === 1 ? "" : "s"}. Upgrade to add more.`,
    );
  }
}

export function assertPluginLimit(plan: PlanEntitlements, currentPlugins: number): void {
  if (currentPlugins >= plan.maxPlugins) {
    throw new PlanLimitError(
      `${plan.name} includes ${plan.maxPlugins === Number.POSITIVE_INFINITY ? "unlimited" : plan.maxPlugins} plugin${plan.maxPlugins === 1 ? "" : "s"}. Upgrade to add more.`,
    );
  }
}

export function assertHarnessAllowed(
  plan: PlanEntitlements,
  harness: CodingHarness,
): void {
  if (harness === "none") return;
  if (!plan.harnesses.includes(harness)) {
    throw new PlanLimitError(
      `${plan.name} cannot use the ${harness} coding harness. Upgrade to unlock it.`,
    );
  }
}

export function assertModelTierAllowed(plan: PlanEntitlements, tier: ModelTier): void {
  if (!plan.modelTiers.includes(tier)) {
    throw new PlanLimitError(
      `${plan.name} cannot use ${tier} models. Upgrade to unlock this catalog.`,
    );
  }
}

export function assertTokenBudget(plan: PlanEntitlements, usedTokens: number): void {
  if (usedTokens >= plan.monthlyTokens) {
    throw new PlanLimitError(
      `${plan.name} included tokens are used up for this month. Upgrade or wait for the next period.`,
    );
  }
}

export function assertComputerHours(plan: PlanEntitlements, usedSeconds: number): void {
  if (usedSeconds >= plan.computerHours * 3600) {
    throw new PlanLimitError(
      `${plan.name} included computer hours are used up for this month. Upgrade or wait for the next period.`,
    );
  }
}

export function stripePriceEnvName(plan: Exclude<PlanId, "free">): string {
  return plan === "plus"
    ? "STRIPE_PRICE_PLUS"
    : plan === "pro"
      ? "STRIPE_PRICE_PRO"
      : "STRIPE_PRICE_ULTRA";
}
