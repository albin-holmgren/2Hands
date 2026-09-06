import type { PrismaClient } from "@rakazo/db";
import { billingTestStore } from "@rakazo/db/testing/billing-store";
import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelPlanChange,
  planChangeStatus,
  schedulePlanChange,
  setCancelAtPeriodEnd,
} from "./stripe-plan-changes.js";

afterEach(() => vi.unstubAllEnvs());

function fixture() {
  vi.stubEnv("STRIPE_PRICE_PLUS", "price-plus");
  vi.stubEnv("STRIPE_PRICE_PRO", "price-pro");
  vi.stubEnv("STRIPE_PRICE_ULTRA", "price-ultra");
  const start = 1_788_220_800;
  const end = start + 30 * 86_400;
  const store = billingTestStore({
    plan: "plus",
    stripeCustomerId: "cus-example",
    stripeSubscriptionId: "sub-example",
  });
  const member = vi.fn(async () => ({ role: "owner" }));
  const prisma = { ...store.prisma, member: { findUnique: member } } as unknown as PrismaClient;
  const stripe = new Stripe("sk_test_example");
  const subscription = {
    id: "sub-example",
    customer: "cus-example",
    status: "active",
    schedule: null,
    cancel_at_period_end: false,
    metadata: {},
    collection_method: "charge_automatically",
    items: {
      data: [
        {
          price: { id: "price-plus" },
          quantity: 1,
          current_period_start: start,
          current_period_end: end,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
  const current = {
    start_date: start,
    end_date: end,
    currency: "usd",
    billing_cycle_anchor: "automatic",
    collection_method: "charge_automatically",
    add_invoice_items: [],
    discounts: [],
    metadata: { organizationId: "org-1", plan: "plus" },
    items: [
      {
        price: "price-plus",
        quantity: 1,
        discounts: [],
        tax_rates: [],
        metadata: { source: "checkout" },
      },
    ],
  } as unknown as Stripe.SubscriptionSchedule.Phase;
  let schedule: Stripe.SubscriptionSchedule | null = null;
  const creations = new Map<string, Stripe.SubscriptionSchedule>();
  vi.spyOn(stripe.subscriptions, "retrieve").mockImplementation(
    async () => structuredClone(subscription) as Stripe.Response<Stripe.Subscription>,
  );
  const create = vi
    .spyOn(stripe.subscriptionSchedules, "create")
    .mockImplementation(async (_params, request?: Stripe.RequestOptions) => {
      if (request?.idempotencyKey && creations.has(request.idempotencyKey))
        return structuredClone(
          creations.get(request.idempotencyKey)!,
        ) as Stripe.Response<Stripe.SubscriptionSchedule>;
      if (subscription.schedule) throw new Error("Subscription already has a schedule");
      schedule = {
        id: `schedule-${create.mock.calls.length}`,
        customer: "cus-example",
        subscription: "sub-example",
        status: "active",
        end_behavior: "release",
        metadata: {},
        current_phase: { start_date: start, end_date: end },
        phases: [current],
      } as unknown as Stripe.SubscriptionSchedule;
      subscription.schedule = schedule.id;
      if (request?.idempotencyKey) creations.set(request.idempotencyKey, schedule);
      return structuredClone(schedule) as Stripe.Response<Stripe.SubscriptionSchedule>;
    });
  vi.spyOn(stripe.subscriptionSchedules, "retrieve").mockImplementation(
    async () => structuredClone(schedule!) as Stripe.Response<Stripe.SubscriptionSchedule>,
  );
  const update = vi
    .spyOn(stripe.subscriptionSchedules, "update")
    .mockImplementation(async (_id, params) => {
      schedule = {
        ...schedule!,
        ...params,
        phases:
          params?.phases?.map((phase) => ({
            add_invoice_items: [],
            ...phase,
          })) ?? schedule!.phases,
      } as Stripe.SubscriptionSchedule;
      return structuredClone(schedule) as Stripe.Response<Stripe.SubscriptionSchedule>;
    });
  const release = vi.spyOn(stripe.subscriptionSchedules, "release").mockImplementation(async () => {
    subscription.schedule = null;
    schedule!.status = "released";
    return structuredClone(schedule!) as Stripe.Response<Stripe.SubscriptionSchedule>;
  });
  const cancel = vi
    .spyOn(stripe.subscriptions, "update")
    .mockImplementation(async (_id, params) => {
      subscription.cancel_at_period_end = params?.cancel_at_period_end ?? false;
      for (const [key, value] of Object.entries(params?.metadata ?? {})) {
        if (value === "") delete subscription.metadata[key];
        else subscription.metadata[key] = String(value);
      }
      return structuredClone(subscription) as Stripe.Response<Stripe.Subscription>;
    });
  const price = vi.spyOn(stripe.prices, "retrieve").mockImplementation(
    async (id) =>
      ({
        id,
        active: true,
        currency: "usd",
        unit_amount: id === "price-pro" ? 6000 : 20000,
        type: "recurring",
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
        billing_scheme: "per_unit",
      }) as Stripe.Response<Stripe.Price>,
  );
  const options = { prisma, spaceId: "space-1", userId: "user-1" };
  const change = {
    ...options,
    plan: "pro" as const,
    expectedPeriodEnd: new Date(end * 1000).toISOString(),
  };
  return {
    options,
    change,
    stripe,
    create,
    update,
    release,
    cancel,
    price,
    member,
    subscription,
    current,
    store,
    get schedule() {
      return schedule;
    },
  };
}

describe("plan changes at renewal", () => {
  it("creates one future full-price phase, preserving current paid usage and Checkout discounts", async () => {
    const f = fixture();
    f.current.discounts = [
      { discount: "di-existing", coupon: "coupon-example", promotion_code: null },
    ];
    f.current.default_payment_method = "pm-current";
    const initialBilling = structuredClone(f.store.state().billing);
    const result = await schedulePlanChange(f.change, f);
    expect(result).toMatchObject({
      currentPlan: "plus",
      pendingChange: { plan: "pro", priceUsd: 60, effectiveAt: f.change.expectedPeriodEnd },
    });
    expect(f.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        end_behavior: "release",
        proration_behavior: "none",
        phases: [
          expect.objectContaining({
            start_date: f.current.start_date,
            end_date: f.current.end_date,
            items: [expect.objectContaining({ price: "price-plus" })],
            discounts: [{ discount: "di-existing" }],
          }),
          expect.objectContaining({
            start_date: f.current.end_date,
            iterations: 1,
            items: [expect.objectContaining({ price: "price-pro" })],
            discounts: [{ discount: "di-existing" }],
            proration_behavior: "none",
          }),
        ],
      }),
    );
    expect(f.store.state().billing).toEqual(initialBilling);
    expect(f.store.state().periods.size).toBe(0);
    const phases = f.update.mock.calls.find((call) => call[1]?.phases)?.[1]?.phases;
    expect(phases?.[0]?.default_payment_method).toBe("pm-current");
    expect(phases?.[1]?.default_payment_method).toBeUndefined();
  });

  it("serializes duplicate requests into one scheduled change", async () => {
    const f = fixture();
    await Promise.all([schedulePlanChange(f.change, f), schedulePlanChange(f.change, f)]);
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.update.mock.calls.filter((call) => call[1]?.phases)).toHaveLength(1);
    expect((await schedulePlanChange(f.change, f)).pendingChange?.plan).toBe("pro");
    expect(f.create).toHaveBeenCalledOnce();
  });

  it("recovers a lost phase-update response from Stripe's current pending change", async () => {
    const f = fixture();
    const update = f.update.getMockImplementation()!;
    let lost = false;
    f.update.mockImplementation(async (scheduleId, parameters) => {
      const result = await update(scheduleId, parameters);
      if (parameters?.phases && !lost) {
        lost = true;
        throw new Error("unknown phase update outcome");
      }
      return result;
    });
    await expect(schedulePlanChange(f.change, f)).rejects.toThrow("unknown phase update outcome");
    expect((await planChangeStatus(f.options, f)).pendingChange?.plan).toBe("pro");
    expect((await schedulePlanChange(f.change, f)).pendingChange?.plan).toBe("pro");
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.update.mock.calls.filter((call) => call[1]?.phases)).toHaveLength(1);
  });

  it("can replace and undo a pending plan without canceling the subscription", async () => {
    const f = fixture();
    await schedulePlanChange(f.change, f);
    expect((await schedulePlanChange({ ...f.change, plan: "ultra" }, f)).pendingChange?.plan).toBe(
      "ultra",
    );
    expect((await cancelPlanChange(f.options, f)).pendingChange).toBeNull();
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.release).toHaveBeenCalledWith(expect.any(String), { preserve_cancel_date: true });
    expect(
      f.cancel.mock.calls.filter((call) => call[1]?.cancel_at_period_end !== undefined),
    ).toHaveLength(0);
    await cancelPlanChange(f.options, f);
    expect(f.release).toHaveBeenCalledOnce();
  });

  it("recovers a successful create whose response was lost without adopting a foreign schedule", async () => {
    const f = fixture();
    const create = f.create.getMockImplementation()! as (
      params?: Stripe.SubscriptionScheduleCreateParams,
      request?: Stripe.RequestOptions,
    ) => Promise<unknown>;
    f.create.mockImplementationOnce(async (params, request?: Stripe.RequestOptions) => {
      await create(params as Stripe.SubscriptionScheduleCreateParams, request);
      throw new Error("unknown transport outcome");
    });
    await expect(schedulePlanChange(f.change, f)).rejects.toThrow("unknown transport outcome");
    expect((await schedulePlanChange(f.change, f)).pendingChange?.plan).toBe("pro");
    expect(f.create).toHaveBeenCalledTimes(2);
    expect(f.create.mock.calls[0]).toEqual(f.create.mock.calls[1]);
  });

  it("removes a newly created neutral schedule when custom billing terms prevent a safe change", async () => {
    const f = fixture();
    f.current.trial_end = f.current.end_date;
    await expect(schedulePlanChange(f.change, f)).rejects.toThrow("custom billing terms");
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.update.mock.calls.filter((call) => call[1]?.phases)).toHaveLength(0);
    expect(
      f.cancel.mock.calls.filter((call) => call[1]?.cancel_at_period_end !== undefined),
    ).toHaveLength(0);
  });

  it("does not adopt an unrelated schedule even when a creation intent exists", async () => {
    const f = fixture();
    await schedulePlanChange(f.change, f);
    f.schedule!.metadata = {};
    f.subscription.metadata = {
      twohands_schedule_create_key: "a-different-request",
      twohands_schedule_create_at: String(Date.now()),
    };
    f.update.mockClear();
    await expect(planChangeStatus(f.options, f)).rejects.toThrow("already has a schedule");
    expect(f.update).not.toHaveBeenCalled();
    expect(f.schedule!.metadata).toEqual({});
  });

  it("fails closed once the stored creation key exceeds guaranteed Stripe retention", async () => {
    const f = fixture();
    f.subscription.metadata = {
      twohands_schedule_create_key: "expired-request",
      twohands_schedule_create_at: String(Date.now() - 24 * 3_600_000),
    };
    await expect(schedulePlanChange(f.change, f)).rejects.toThrow("support to reconcile");
    expect(f.create).not.toHaveBeenCalled();
  });

  it("releases only our schedule before canceling at renewal, and lets the owner keep the subscription", async () => {
    const f = fixture();
    await schedulePlanChange(f.change, f);
    expect(await setCancelAtPeriodEnd({ ...f.change, cancel: true }, f)).toMatchObject({
      cancelAtPeriodEnd: true,
      pendingChange: null,
      currentPlan: "plus",
      canChange: false,
      canManageCancellation: true,
    });
    expect(f.release.mock.invocationCallOrder[0]).toBeLessThan(
      f.cancel.mock.invocationCallOrder[
        f.cancel.mock.calls.findIndex((call) => call[1]?.cancel_at_period_end === true)
      ]!,
    );
    expect(f.cancel).toHaveBeenLastCalledWith("sub-example", {
      cancel_at_period_end: true,
      proration_behavior: "none",
    });
    expect(await setCancelAtPeriodEnd({ ...f.change, cancel: false }, f)).toMatchObject({
      cancelAtPeriodEnd: false,
      pendingChange: null,
      canChange: true,
      canManageCancellation: true,
    });
  });

  it("allows cancellation of a past-due subscription with our schedule while rejecting plan changes", async () => {
    const f = fixture();
    await schedulePlanChange(f.change, f);
    f.subscription.status = "past_due";
    expect(await planChangeStatus(f.options, f)).toMatchObject({
      canChange: false,
      canManageCancellation: true,
      pendingChange: { plan: "pro" },
    });
    await expect(schedulePlanChange(f.change, f)).rejects.toThrow("Resolve this subscription");
    expect(await setCancelAtPeriodEnd({ ...f.change, cancel: true }, f)).toMatchObject({
      cancelAtPeriodEnd: true,
      pendingChange: null,
      canChange: false,
      canManageCancellation: true,
    });
    expect(f.release).toHaveBeenCalledOnce();
  });

  it.each(["canceled", "incomplete_expired", "missing-period"] as const)(
    "does not offer cancellation management for %s",
    async (condition) => {
      const f = fixture();
      if (condition === "missing-period") f.subscription.items.data[0]!.current_period_end = 0;
      else f.subscription.status = condition;
      expect(await planChangeStatus(f.options, f)).toMatchObject({
        canChange: false,
        canManageCancellation: false,
      });
      await expect(setCancelAtPeriodEnd({ ...f.change, cancel: true }, f)).rejects.toThrow();
      expect(f.cancel).not.toHaveBeenCalled();
      expect(f.release).not.toHaveBeenCalled();
    },
  );

  it("rejects foreign or manually created schedules on every mutation", async () => {
    const f = fixture();
    await schedulePlanChange(f.change, f);
    f.schedule!.metadata = { organizationId: "someone-else" };
    f.update.mockClear();
    f.cancel.mockClear();
    expect(await planChangeStatus(f.options, f)).toMatchObject({
      canChange: false,
      canManageCancellation: false,
      pendingChange: null,
    });
    for (const action of [
      () => schedulePlanChange(f.change, f),
      () => cancelPlanChange(f.options, f),
      () => setCancelAtPeriodEnd({ ...f.change, cancel: true }, f),
    ])
      await expect(action()).rejects.toThrow("separately managed schedule");
    expect(f.update).not.toHaveBeenCalled();
    expect(f.release).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
  });

  it("rejects a stale confirmation and invalid configured price before creating a schedule", async () => {
    const f = fixture();
    await expect(
      schedulePlanChange({ ...f.change, expectedPeriodEnd: "2020-01-01T00:00:00.000Z" }, f),
    ).rejects.toThrow("billing period changed");
    f.price.mockResolvedValue({
      active: true,
      currency: "usd",
      unit_amount: 1,
    } as Stripe.Response<Stripe.Price>);
    await expect(schedulePlanChange(f.change, f)).rejects.toThrow("monthly price");
    expect(f.create).not.toHaveBeenCalled();
  });

  it("requires an organization owner before any provider read, and verifies customer binding", async () => {
    const f = fixture();
    f.member.mockResolvedValue({ role: "member" });
    await expect(planChangeStatus(f.options, f)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    f.member.mockResolvedValue({ role: "owner" });
    f.subscription.customer = "cus-other";
    await expect(schedulePlanChange(f.change, f)).rejects.toThrow("ownership");
    expect(f.create).not.toHaveBeenCalled();
  });
});
