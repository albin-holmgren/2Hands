import { PLANS } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createModelMeter } from "./run-metering.js";

const ledger = vi.hoisted(() => ({
  organizationIdForSpace: vi.fn(async () => "organization"),
  ensureOrganizationBilling: vi.fn(),
  reserveUsage: vi.fn(async () => ({ id: "reservation", amountUsd: 0.01 })),
  settleUsage: vi.fn(async () => {}),
  releaseUsage: vi.fn(async () => {}),
}));
vi.mock("@rakazo/db", () => ledger);
const prisma = {} as PrismaClient;
const scope = { userId: "user", spaceId: "space", runId: "run" };
const call = {
  provider: "test",
  model: "cheap",
  inputTokenLimit: 100,
  outputTokenLimit: 20,
  rates: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 5 },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BILLING_ENABLED", "true");
  ledger.ensureOrganizationBilling.mockResolvedValue({ entitlements: PLANS.free });
});
afterEach(() => vi.unstubAllEnvs());
describe("hosted run metering", () => {
  it("skips hosted allowance for BYOK and disabled billing", () => {
    expect(createModelMeter(prisma, scope, "byok")).toBeUndefined();
    vi.stubEnv("BILLING_ENABLED", "false");
    expect(createModelMeter(prisma, scope, "hosted")).toBeUndefined();
    expect(ledger.reserveUsage).not.toHaveBeenCalled();
  });
  it("reserves maximum input/cache cost and settles with the same price snapshot", async () => {
    const rates = { ...call.rates };
    const reservation = await createModelMeter(prisma, scope, "hosted")!({ ...call, rates });
    expect(ledger.reserveUsage).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        ...scope,
        amountUsd: 0.00054,
        organizationId: "organization",
        funding: "hosted",
      }),
    );
    rates.input = 999;
    await reservation.settle({ input: 10, output: 5, cacheRead: 20, cacheWrite: 3 });
    expect(ledger.settleUsage).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        reservationId: "reservation",
        actualAmountUsd: 0.000037,
      }),
    );
  });
  it.each([NaN, Infinity, -1, 0.5])(
    "rejects invalid reservation bounds %s before admission",
    async (limit) => {
      await expect(
        createModelMeter(prisma, scope, "hosted")!({ ...call, inputTokenLimit: limit }),
      ).rejects.toThrow(/bounded token limit/);
      expect(ledger.reserveUsage).not.toHaveBeenCalled();
    },
  );
  it.each([
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    { input: -1, output: 20, cacheRead: 0, cacheWrite: 0 },
    { input: NaN, output: 5, cacheRead: 0, cacheWrite: 0 },
  ])("retains a hold when provider usage is missing or invalid", async (usage) => {
    const reservation = await createModelMeter(prisma, scope, "hosted")!(call);
    await expect(reservation.settle(usage)).rejects.toThrow(/reservation is retained/);
    expect(ledger.settleUsage).not.toHaveBeenCalled();
    expect(ledger.releaseUsage).not.toHaveBeenCalled();
  });
  it("uses separate reservations for model calls in the same parent run", async () => {
    const meter = createModelMeter(prisma, scope, "hosted")!;
    await Promise.all([meter(call), meter(call)]);
    const inputs = ledger.reserveUsage.mock.calls as unknown as Array<
      [unknown, { operationKey: string; runId: string }]
    >;
    expect(inputs[0]![1].operationKey).not.toBe(inputs[1]![1].operationKey);
    expect(inputs.map((entry) => entry[1].runId)).toEqual(["run", "run"]);
  });
});
