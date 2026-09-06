import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { BillingPlanChangeStatus } from "@rakazo/contracts";
import { hostedBillingEnabled, PLANS, type PlanId } from "@rakazo/core";
import { type OrganizationBilling, type PrismaClient, withBillingLock } from "@rakazo/db";
import type Stripe from "stripe";
import {
  assertBillingOwner,
  createStripeClient,
  planForPriceId,
  priceIdForPlan,
} from "./stripe-billing.js";

type PaidPlan = Exclude<PlanId, "free">;
type Options = { prisma: PrismaClient; spaceId: string; userId: string };
type Dependencies = { stripe?: Stripe };
type State = {
  subscription: Stripe.Subscription | null;
  schedule: Stripe.SubscriptionSchedule | null;
};
const manager = "2hands-renewal-v1";
const creationKey = "twohands_schedule_create_key";
const creationAt = "twohands_schedule_create_at";
const foreignSchedule =
  "This subscription has a separately managed schedule. Contact support to change it.";
const id = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
const fail = (message: string): never => {
  throw new ORPCError("BAD_REQUEST", { message });
};

function stripeClient(dependencies: Dependencies): Stripe {
  if (dependencies.stripe) return dependencies.stripe;
  if (!hostedBillingEnabled(process.env.BILLING_ENABLED))
    return fail("Hosted billing is not enabled.");
  return createStripeClient() ?? fail("Billing is not configured.");
}

async function readState(stripe: Stripe, billing: OrganizationBilling): Promise<State> {
  if (!billing.stripeSubscriptionId) return { subscription: null, schedule: null };
  const subscription = await stripe.subscriptions.retrieve(billing.stripeSubscriptionId, {
    expand: ["latest_invoice"],
  });
  if (!billing.stripeCustomerId || id(subscription.customer) !== billing.stripeCustomerId)
    return fail("Subscription ownership could not be verified.");
  const schedule = id(subscription.schedule)
    ? await stripe.subscriptionSchedules.retrieve(id(subscription.schedule)!)
    : null;
  return { subscription, schedule };
}

function ownedSchedule(state: State, organizationId: string) {
  const { schedule, subscription } = state;
  return (
    !schedule ||
    (schedule.metadata?.manager === manager &&
      schedule.metadata.organizationId === organizationId &&
      id(schedule.customer) === id(subscription?.customer) &&
      id(schedule.subscription) === subscription?.id &&
      schedule.status === "active")
  );
}

async function clearCreationIntent(stripe: Stripe, subscription: Stripe.Subscription) {
  await stripe.subscriptions.update(subscription.id, {
    metadata: { [creationKey]: "", [creationAt]: "" },
  });
  delete subscription.metadata?.[creationKey];
  delete subscription.metadata?.[creationAt];
}

/** Stripe forbids metadata during from_subscription creation. Persist a nonsecret
 * replay key on the subscription first; the replayed result proves which schedule
 * we created, even when its first response was lost. Never infer ownership by time. */
async function createOrRecoverSchedule(
  stripe: Stripe,
  state: State,
  organizationId: string,
  mayReplaceReleased = true,
): Promise<Stripe.SubscriptionSchedule> {
  const subscription = state.subscription ?? fail("No subscription is available.");
  let key = subscription.metadata?.[creationKey];
  if (state.schedule && ownedSchedule(state, organizationId)) {
    if (key) await clearCreationIntent(stripe, subscription);
    return state.schedule;
  }
  if (state.schedule && !key) return fail(foreignSchedule);
  if (key) {
    const requestedAt = Number(subscription.metadata[creationAt]);
    // Stripe guarantees idempotency retention for at least 24 hours. Leave a
    // margin; an expired uncertain request requires operator reconciliation.
    if (
      !Number.isFinite(requestedAt) ||
      requestedAt <= 0 ||
      Date.now() - requestedAt > 23 * 3_600_000
    )
      return fail("An earlier plan-change request needs support to reconcile it safely.");
  } else {
    key = `renewal:${organizationId}:${randomUUID()}`;
    const metadata = { [creationKey]: key, [creationAt]: String(Date.now()) };
    await stripe.subscriptions.update(subscription.id, { metadata });
    subscription.metadata = { ...subscription.metadata, ...metadata };
  }
  const replay = await stripe.subscriptionSchedules.create(
    { from_subscription: subscription.id },
    { idempotencyKey: key },
  );
  // Idempotency replays return the original response, not the object's live
  // status. A schedule may have been released since that response was cached.
  const created = await stripe.subscriptionSchedules.retrieve(replay.id);
  if (!state.schedule && mayReplaceReleased && ["released", "completed"].includes(created.status)) {
    // A previous successful release may have lost its final acknowledgement.
    // The old idempotency result is terminal; clear it before a fresh intent.
    await clearCreationIntent(stripe, subscription);
    return createOrRecoverSchedule(stripe, state, organizationId, false);
  }
  if (
    created.status !== "active" ||
    id(created.customer) !== id(subscription.customer) ||
    id(created.subscription) !== subscription.id ||
    (state.schedule && state.schedule.id !== created.id)
  )
    return fail(foreignSchedule);
  const tagged = await stripe.subscriptionSchedules.update(created.id, {
    metadata: { manager, organizationId },
  });
  state.schedule = tagged;
  await clearCreationIntent(stripe, subscription);
  return tagged;
}

async function recoverPendingIntent(stripe: Stripe, state: State, organizationId: string) {
  if (state.subscription?.metadata?.[creationKey])
    state.schedule = await createOrRecoverSchedule(stripe, state, organizationId);
}

function status(state: State, organizationId: string): BillingPlanChangeStatus {
  const { subscription, schedule } = state;
  const item = subscription?.items.data[0];
  const ended = !subscription || ["canceled", "incomplete_expired"].includes(subscription.status);
  const currentPlan = ended ? "free" : planForPriceId(item?.price.id);
  const end = ended ? undefined : item?.current_period_end;
  let reason: string | null = null;
  if (ended) reason = "Choose a paid plan to start a subscription.";
  else if (!ownedSchedule(state, organizationId)) reason = foreignSchedule;
  else if (
    subscription.status !== "active" ||
    !end ||
    currentPlan === "free" ||
    subscription.items.data.length !== 1 ||
    item?.quantity !== 1 ||
    subscription.collection_method !== "charge_automatically" ||
    subscription.pending_update ||
    subscription.pause_collection ||
    (subscription.cancel_at && !subscription.cancel_at_period_end)
  )
    reason = "Resolve this subscription in billing before changing plans.";
  else if (subscription.cancel_at_period_end)
    reason = "Keep your subscription before scheduling a plan change.";
  const future =
    ownedSchedule(state, organizationId) && end
      ? schedule?.phases.find((phase) => phase.start_date === end)
      : undefined;
  const pendingPlan = planForPriceId(id(future?.items[0]?.price));
  return {
    currentPlan,
    currentPeriodEnd: end ? new Date(end * 1000).toISOString() : null,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    pendingChange:
      future && pendingPlan !== "free"
        ? {
            plan: pendingPlan,
            priceUsd: PLANS[pendingPlan].priceUsd,
            effectiveAt: new Date(future.start_date * 1000).toISOString(),
          }
        : null,
    canChange: reason === null,
    canManageCancellation: !ended && ownedSchedule(state, organizationId) && Boolean(end),
    unavailableReason: reason,
  };
}

async function locked<T>(
  options: Options,
  dependencies: Dependencies,
  action: (stripe: Stripe, state: State, organizationId: string) => Promise<T>,
) {
  const organizationId = await assertBillingOwner(options.prisma, options.spaceId, options.userId);
  const stripe = stripeClient(dependencies);
  // Share the checkout/webhook lock; retries reread Stripe, including a prior unknown outcome.
  return withBillingLock(
    options.prisma,
    organizationId,
    async (_tx, billing) => action(stripe, await readState(stripe, billing), organizationId),
    { timeoutMs: 60_000 },
  );
}

export function planChangeStatus(options: Options, dependencies: Dependencies = {}) {
  return locked(options, dependencies, async (stripe, state, organizationId) => {
    // Only an already-authorized uncertain create is recovered on settings load.
    // Ordinary reads never create schedules or change a subscription's plan.
    await recoverPendingIntent(stripe, state, organizationId);
    return status(state, organizationId);
  });
}

function checkPeriod(state: State, expected: string) {
  const end = state.subscription?.items.data[0]?.current_period_end;
  if (!end || new Date(end * 1000).toISOString() !== expected)
    fail("Your billing period changed. Review the renewal date and try again.");
}

function discounts(values: Stripe.SubscriptionSchedule.Phase.Discount[] | null | undefined) {
  return (values ?? []).map((value) =>
    value.discount
      ? { discount: id(value.discount)! }
      : value.promotion_code
        ? { promotion_code: id(value.promotion_code)! }
        : { coupon: id(value.coupon)! },
  );
}

/** Preserve the supported Checkout configuration; never silently drop a custom billing term. */
function preservePhase(
  phase: Stripe.SubscriptionSchedule.Phase,
): Stripe.SubscriptionScheduleUpdateParams.Phase {
  if (
    phase.add_invoice_items.length ||
    phase.application_fee_percent ||
    phase.billing_thresholds ||
    phase.on_behalf_of ||
    phase.transfer_data ||
    phase.trial_end ||
    phase.items.length !== 1 ||
    phase.items.some((item) => item.billing_thresholds) ||
    phase.automatic_tax?.liability?.type === "account" ||
    phase.invoice_settings?.issuer?.type === "account"
  )
    return fail("This subscription has custom billing terms. Contact support to change plans.");
  return {
    start_date: phase.start_date,
    end_date: phase.end_date,
    items: phase.items.map((item) => ({
      price: id(item.price)!,
      quantity: item.quantity ?? 1,
      discounts: discounts(item.discounts),
      tax_rates: item.tax_rates?.map((rate) => rate.id),
      metadata: item.metadata ?? undefined,
    })),
    currency: phase.currency,
    billing_cycle_anchor: phase.billing_cycle_anchor ?? "automatic",
    collection_method: phase.collection_method ?? undefined,
    automatic_tax: phase.automatic_tax ? { enabled: phase.automatic_tax.enabled } : undefined,
    default_payment_method: id(phase.default_payment_method),
    default_tax_rates: phase.default_tax_rates?.map((rate) => rate.id),
    description: phase.description ?? undefined,
    discounts: discounts(phase.discounts),
    invoice_settings: phase.invoice_settings
      ? {
          account_tax_ids: phase.invoice_settings.account_tax_ids?.map((value) => id(value)!),
          days_until_due: phase.invoice_settings.days_until_due ?? undefined,
          issuer: phase.invoice_settings.issuer
            ? { type: phase.invoice_settings.issuer.type }
            : undefined,
        }
      : undefined,
    metadata: phase.metadata ?? undefined,
    proration_behavior: "none",
  };
}

export function schedulePlanChange(
  options: Options & { plan: PaidPlan; expectedPeriodEnd: string },
  dependencies: Dependencies = {},
) {
  return locked(options, dependencies, async (stripe, state, organizationId) => {
    await recoverPendingIntent(stripe, state, organizationId);
    const initial = status(state, organizationId);
    if (!initial.canChange) return fail(initial.unavailableReason!);
    checkPeriod(state, options.expectedPeriodEnd);
    if (options.plan === initial.currentPlan)
      return fail("Choose a different plan, or undo the pending change.");
    const priceId = priceIdForPlan(options.plan) ?? fail("This plan is not available yet.");
    const price = await stripe.prices.retrieve(priceId);
    if (
      !price.active ||
      price.currency !== "usd" ||
      price.unit_amount !== PLANS[options.plan].priceUsd * 100 ||
      price.type !== "recurring" ||
      price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1 ||
      price.recurring.usage_type !== "licensed" ||
      price.billing_scheme !== "per_unit" ||
      price.transform_quantity
    )
      return fail("The selected plan's monthly price could not be verified.");
    if (initial.pendingChange?.plan === options.plan) return initial;
    const subscription = state.subscription!;
    const end = subscription.items.data[0]!.current_period_end;
    const wasAttached = Boolean(state.schedule);
    const schedule =
      state.schedule ?? (await createOrRecoverSchedule(stripe, state, organizationId));
    let current: Stripe.SubscriptionSchedule.Phase;
    let preserved: Stripe.SubscriptionScheduleUpdateParams.Phase;
    try {
      current =
        schedule.phases.find((phase) => phase.start_date === schedule.current_phase?.start_date) ??
        fail("The current subscription phase could not be verified.");
      if (
        current.start_date > subscription.items.data[0]!.current_period_start ||
        id(current.items[0]?.price) !== subscription.items.data[0]!.price.id
      )
        return fail("Your subscription changed. Refresh billing before trying again.");
      preserved = preservePhase(current);
    } catch (error) {
      // No update was dispatched: remove only the neutral schedule just created by
      // this request. Unknown create/update outcomes remain discoverable for retry.
      if (!wasAttached)
        await stripe.subscriptionSchedules.release(schedule.id, { preserve_cancel_date: true });
      throw error;
    }
    // Future renewals inherit the schedule's current payment-method setting, so
    // replacing a card does not leave a stale card pinned on the target phase.
    const { end_date: _end, default_payment_method: _method, ...next } = preserved;
    const updated = await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      proration_behavior: "none",
      phases: [
        { ...preserved, end_date: end },
        {
          ...next,
          start_date: end,
          iterations: 1,
          items: [{ ...preserved.items[0]!, price: priceId }],
          metadata: { ...current.metadata, plan: options.plan },
        },
      ],
    });
    // Scheduling writes no local entitlement or allowance; only a paid new-period
    // invoice may change those through the existing webhook reconciliation.
    return status({ subscription, schedule: updated }, organizationId);
  });
}

export function cancelPlanChange(options: Options, dependencies: Dependencies = {}) {
  return locked(options, dependencies, async (stripe, state, organizationId) => {
    await recoverPendingIntent(stripe, state, organizationId);
    if (!ownedSchedule(state, organizationId)) return fail(foreignSchedule);
    if (state.schedule)
      await stripe.subscriptionSchedules.release(state.schedule.id, { preserve_cancel_date: true });
    return status({ ...state, schedule: null }, organizationId);
  });
}

export function setCancelAtPeriodEnd(
  options: Options & { cancel: boolean; expectedPeriodEnd: string },
  dependencies: Dependencies = {},
) {
  return locked(options, dependencies, async (stripe, state, organizationId) => {
    await recoverPendingIntent(stripe, state, organizationId);
    if (!ownedSchedule(state, organizationId)) return fail(foreignSchedule);
    checkPeriod(state, options.expectedPeriodEnd);
    if (
      !state.subscription ||
      ["canceled", "incomplete_expired"].includes(state.subscription.status)
    )
      return fail("This subscription has already ended.");
    // Stripe's portal cannot cancel while a schedule is attached. Release, never
    // cancel, our schedule first; cancellation still preserves the paid period.
    if (state.schedule)
      await stripe.subscriptionSchedules.release(state.schedule.id, { preserve_cancel_date: true });
    const subscription = await stripe.subscriptions.update(state.subscription.id, {
      cancel_at_period_end: options.cancel,
      proration_behavior: "none",
    });
    return status({ subscription, schedule: null }, organizationId);
  });
}
