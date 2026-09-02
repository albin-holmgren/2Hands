import { describe, expect, it } from "vitest";
import {
  assertBotLimit,
  assertHarnessAllowed,
  assertModelTierAllowed,
  parseCodingHarness,
  parsePlanId,
  PlanLimitError,
  PLANS,
} from "./plans.js";

describe("plans", () => {
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
