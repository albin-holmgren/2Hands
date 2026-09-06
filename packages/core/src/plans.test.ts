import { describe, expect, it } from "vitest";
import {
  assertBotLimit,
  assertHarnessAllowed,
  assertModelTierAllowed,
  hostedBillingEnabled,
  PLANS,
  PlanLimitError,
  parseCodingHarness,
  parsePlanId,
} from "./plans.js";

describe("plans", () => {
  it("has explicit hosted allowances and paid model choice", () => {
    expect(
      [PLANS.free, PLANS.plus, PLANS.pro, PLANS.ultra].map((p) => [p.priceUsd, p.allowanceUsd]),
    ).toEqual([
      [0, 1],
      [20, 10],
      [60, 30],
      [200, 100],
    ]);
    for (const plan of [PLANS.plus, PLANS.pro, PLANS.ultra])
      expect(() => assertModelTierAllowed(plan, "ultra")).not.toThrow();
    expect(hostedBillingEnabled(undefined)).toBe(false);
    expect(hostedBillingEnabled("false")).toBe(false);
    expect(hostedBillingEnabled("true")).toBe(true);
  });

  it("defaults unknown plan and harness values", () => {
    expect(parsePlanId("enterprise")).toBe("free");
    expect(parseCodingHarness("aider")).toBe("none");
    expect(parseCodingHarness("cursor")).toBe("cursor");
  });

  it("gates bots, harnesses, and model tiers", () => {
    expect(() => assertBotLimit(PLANS.free, 1)).toThrow(PlanLimitError);
    expect(() => assertBotLimit(PLANS.plus, 1)).not.toThrow();
    expect(() => assertHarnessAllowed(PLANS.plus, "codex")).not.toThrow();
    expect(() => assertHarnessAllowed(PLANS.plus, "cursor")).toThrow(/cursor/);
    expect(() => assertModelTierAllowed(PLANS.free, "frontier")).toThrow(PlanLimitError);
    expect(() => assertModelTierAllowed(PLANS.ultra, "ultra")).not.toThrow();
  });
});
