import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, ensureOrganizationBilling, reserveUsage, settleUsage } from "@rakazo/db";
import { Hono } from "hono";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { stripeCanaryConfig } from "../../../packages/testkit/src/cli/stripe-canary-config.js";
import { createCheckoutUrl, createStripeClient } from "./stripe-billing.js";
import {
  cancelPlanChange,
  planChangeStatus,
  schedulePlanChange,
  setCancelAtPeriodEnd,
} from "./stripe-plan-changes.js";
import { mountStripeWebhook } from "./stripe-webhook.js";

const enabled = process.env.VERIFY_STRIPE_TEST_MODE === "1";

// Real Stripe resources, fake people, and an explicit disposable local database only.
// No UI automation: Stripe Checkout deliberately prevents automated frontend testing.
(enabled ? describe : describe.skip)("Stripe test-mode release gate", () => {
  it("verifies checkout, paid grants, renewal, cancellation and webhook reconciliation", async () => {
    const config = stripeCanaryConfig(process.env);
    if (process.env.DATABASE_URL !== config.databaseUrl)
      throw new Error("Run pnpm test:stripe so the canary pins the validated test database.");
    const stripe = createStripeClient(config.secretKey)!;
    // Read-only mode verification happens before creating any resources.
    const balance = await stripe.balance.retrieve().catch(() => {
      throw new Error("Stripe test-mode verification failed; check the sandbox key permissions.");
    });
    expect(balance.livemode).toBe(false);
    const { prisma, pool } = createDb(config.databaseUrl);
    const runId = randomUUID();
    const directory = await mkdtemp(path.join(tmpdir(), "2hands-stripe-test-"));
    const manifest = {
      runId,
      organizations: [] as string[],
      customers: [] as string[],
      clocks: [] as string[],
      prices: [] as string[],
      products: [] as string[],
      checks: [] as string[],
      complete: false,
      cleanupComplete: false,
    };
    const fixtures: Array<{ organizationId: string; userId: string; spaceId: string }> = [];
    const secret = `whsec_${randomUUID()}`;
    const app = new Hono();
    mountStripeWebhook(app, prisma, { stripe, secret, enabled: true });
    const beganAt = Math.floor(Date.now() / 1000) - 60;
    let stage = "setup";
    const cleanupFailures: string[] = [];

    async function persist() {
      await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2), {
        mode: 0o600,
      });
    }
    async function check(name: string) {
      manifest.checks.push(name);
      await persist();
      console.log(`Stripe test gate: ${name}`);
    }
    async function fixture() {
      const id = randomUUID();
      const value = {
        organizationId: `stripe-org-${id}`,
        userId: `stripe-user-${id}`,
        spaceId: `stripe-space-${id}`,
      };
      fixtures.push(value);
      manifest.organizations.push(value.organizationId);
      await persist();
      await prisma.user.create({
        data: { id: value.userId, name: "Stripe Test", email: `${value.userId}@example.test` },
      });
      await prisma.organization.create({
        data: {
          id: value.organizationId,
          name: "Stripe Test",
          slug: value.organizationId,
          createdAt: new Date(),
        },
      });
      await prisma.member.create({
        data: {
          id: randomUUID(),
          organizationId: value.organizationId,
          userId: value.userId,
          role: "owner",
          createdAt: new Date(),
        },
      });
      await prisma.space.create({
        data: { id: value.spaceId, organizationId: value.organizationId, name: "Payment Test" },
      });
      await prisma.spaceMember.create({
        data: { id: randomUUID(), ...value, role: "owner", createdAt: new Date() },
      });
      await ensureOrganizationBilling(prisma, value.organizationId);
      return value;
    }
    async function customer(value: Awaited<ReturnType<typeof fixture>>, clock?: string) {
      const created = await stripe.customers.create(
        {
          name: "2hands synthetic payment check",
          email: `${value.userId}@example.test`,
          metadata: { canaryRun: runId, organizationId: value.organizationId },
          ...(clock ? { test_clock: clock } : {}),
        },
        { idempotencyKey: `${runId}:${value.organizationId}:customer` },
      );
      expect(created.livemode).toBe(false);
      manifest.customers.push(created.id);
      await persist();
      await prisma.organizationBilling.update({
        where: { organizationId: value.organizationId },
        data: { stripeCustomerId: created.id },
      });
      return created.id;
    }
    async function card(customerId: string) {
      const method = await stripe.paymentMethods.create({
        type: "card",
        card: { token: "tok_visa" },
      });
      await stripe.paymentMethods.attach(method.id, { customer: customerId });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: method.id },
      });
      return method.id;
    }
    async function eventFor(
      type: Stripe.Event.Type,
      customerId: string,
      matches: (event: Stripe.Event) => boolean = () => true,
    ) {
      return poll(`Stripe ${type} event`, async () => {
        // Stripe has no customer filter for Events. Keep only events for our newly created
        // customer, never log payloads, and require a dedicated sandbox in the runbook.
        const events = await stripe.events.list({
          types: [type],
          created: { gte: beganAt },
          limit: 100,
        });
        return events.data.find((event) => {
          const object = event.data.object as { customer?: string | { id: string } };
          return !event.livemode && objectId(object.customer) === customerId && matches(event);
        });
      });
    }
    async function deliver(event: Stripe.Event) {
      expect(event.livemode).toBe(false);
      const payload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
      const response = await app.request("/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      });
      expect(response.status, `Signed ${event.type} must be acknowledged`).toBe(200);
    }
    async function spend(value: Awaited<ReturnType<typeof fixture>>, now: Date) {
      const hold = await reserveUsage(prisma, {
        ...value,
        operationKey: randomUUID(),
        amountUsd: 0.5,
        kind: "ai",
        funding: "hosted",
        now,
      });
      await settleUsage(prisma, { reservationId: hold.id, actualAmountUsd: 0.25, now });
    }
    async function advance(clock: string, frozenTime: number) {
      await stripe.testHelpers.testClocks.advance(clock, { frozen_time: frozenTime });
      await poll("Stripe test clock completion", async () => {
        const current = await stripe.testHelpers.testClocks.retrieve(clock);
        if (current.status === "internal_failure") throw new Error("Stripe test clock failed");
        return current.status === "ready" ? current : undefined;
      });
    }

    try {
      const prices = {} as Record<"plus" | "pro" | "ultra", string>;
      for (const [plan, amount] of [
        ["plus", 2000],
        ["pro", 6000],
        ["ultra", 20000],
      ] as const) {
        const product = await stripe.products.create({
          name: `2hands ${plan} canary`,
          metadata: { canaryRun: runId },
        });
        manifest.products.push(product.id);
        await persist();
        const price = await stripe.prices.create({
          product: product.id,
          currency: "usd",
          unit_amount: amount,
          recurring: { interval: "month" },
          metadata: { canaryRun: runId },
        });
        expect(price.livemode).toBe(false);
        prices[plan] = price.id;
        manifest.prices.push(price.id);
        vi.stubEnv(`STRIPE_PRICE_${plan.toUpperCase()}`, price.id);
        await persist();
      }

      if (process.env.STRIPE_TEST_RENEWAL_ONLY !== "1") {
        stage = "real Checkout completion";
        const checkoutFixture = await fixture();
        // Exercise the production customer binding and serialized duplicate-checkout path.
        const checkoutOptions = {
          prisma,
          ...checkoutFixture,
          email: `${checkoutFixture.userId}@example.test`,
          plan: "plus" as const,
          webOrigin: "http://127.0.0.1:5173",
        };
        const checkoutUrls = await Promise.all([
          createCheckoutUrl(checkoutOptions, { stripe }),
          createCheckoutUrl(checkoutOptions, { stripe }),
        ]);
        expect(checkoutUrls[0]).toBe(checkoutUrls[1]);
        const billing = await prisma.organizationBilling.findUniqueOrThrow({
          where: { organizationId: checkoutFixture.organizationId },
        });
        const checkoutCustomer = billing.stripeCustomerId!;
        manifest.customers.push(checkoutCustomer);
        await persist();
        const pending = await stripe.checkout.sessions.list({
          customer: checkoutCustomer,
          status: "open",
        });
        expect(pending.data).toHaveLength(1);
        const checkout = pending.data[0]!;
        expect(checkout.livemode).toBe(false);
        expect(
          await ensureOrganizationBilling(prisma, checkoutFixture.organizationId),
        ).toMatchObject({ plan: "free", allowanceUsd: 1 });
        const checkoutFile = path.join(directory, "checkout-url.txt");
        await writeFile(checkoutFile, `${checkoutUrls[0]}\n`, { mode: 0o600 });
        console.log(
          `Complete the test Checkout URL saved in ${checkoutFile} with Stripe's 4242 test card. No browser is launched. Waiting up to 10 minutes.`,
        );
        await poll(
          "operator completing the test Checkout",
          async () => {
            const session = await stripe.checkout.sessions.retrieve(checkout.id);
            if (session.status === "expired") throw new Error("Test Checkout expired");
            return session.status === "complete" && session.payment_status === "paid"
              ? session
              : undefined;
          },
          600_000,
          3_000,
        );
        const checkoutEvent = await eventFor(
          "checkout.session.completed",
          checkoutCustomer,
          (event) => eventObjectId(event) === checkout.id,
        );
        await deliver(checkoutEvent);
        expect(
          await ensureOrganizationBilling(prisma, checkoutFixture.organizationId),
        ).toMatchObject({ plan: "plus", allowanceUsd: 10 });
        await check(
          "real Checkout completion grants Plus exactly once; unfinished Checkout grants no paid allowance",
        );

        stage = "incomplete subscription";
        const incompleteFixture = await fixture();
        const incompleteCustomer = await customer(incompleteFixture);
        const incomplete = await stripe.subscriptions.create({
          customer: incompleteCustomer,
          items: [{ price: prices.plus }],
          payment_behavior: "default_incomplete",
        });
        expect(incomplete.status).toBe("incomplete");
        await deliver(
          await eventFor(
            "customer.subscription.created",
            incompleteCustomer,
            (event) => eventObjectId(event) === incomplete.id,
          ),
        );
        expect(
          await ensureOrganizationBilling(prisma, incompleteFixture.organizationId),
        ).toMatchObject({ plan: "free", allowanceUsd: 1 });
        await check("a real unpaid incomplete subscription grants no paid allowance");

        stage = "paid plan grants";
        for (const [plan, allowance] of [
          ["pro", 30],
          ["ultra", 100],
        ] as const) {
          const value = await fixture();
          const customerId = await customer(value);
          const paymentMethod = await card(customerId);
          const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: prices[plan] }],
            default_payment_method: paymentMethod,
            payment_behavior: "error_if_incomplete",
          });
          expect(subscription.status).toBe("active");
          await deliver(await eventFor("invoice.paid", customerId));
          expect(await ensureOrganizationBilling(prisma, value.organizationId)).toMatchObject({
            plan,
            allowanceUsd: allowance,
          });
        }
        await check("paid Pro and Ultra invoices grant the configured $30 and $100 allowances");
      }

      stage = "test clock renewal";
      const value = await fixture();
      const initialTime = Math.floor(Date.now() / 1000);
      const clock = await stripe.testHelpers.testClocks.create({
        frozen_time: initialTime,
        name: `2hands ${runId}`,
      });
      expect(clock.livemode).toBe(false);
      manifest.clocks.push(clock.id);
      await persist();
      const customerId = await customer(value, clock.id);
      const paymentMethod = await card(customerId);
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: prices.plus }],
        default_payment_method: paymentMethod,
        payment_behavior: "error_if_incomplete",
      });
      const initialEvent = await eventFor("invoice.paid", customerId);
      const delayedCreated = await eventFor("customer.subscription.created", customerId);
      await deliver(initialEvent);
      await spend(value, new Date(initialTime * 1000));
      await Promise.all([deliver(initialEvent), deliver(initialEvent), deliver(initialEvent)]);
      expect(
        await prisma.billingProviderEvent.count({ where: { id: `stripe:${initialEvent.id}` } }),
      ).toBe(1);
      expect(
        await ensureOrganizationBilling(prisma, value.organizationId, new Date(initialTime * 1000)),
      ).toMatchObject({ allowanceUsd: 10, spentUsd: 0.25, reservedUsd: 0 });
      const firstEnd = subscription.items.data[0]!.current_period_end;
      stage = "schedule paid upgrade at renewal";
      const changeOptions = {
        prisma,
        ...value,
        plan: "pro" as const,
        expectedPeriodEnd: new Date(firstEnd * 1000).toISOString(),
      };
      const scheduled = await schedulePlanChange(changeOptions, { stripe });
      expect(scheduled).toMatchObject({
        currentPlan: "plus",
        pendingChange: { plan: "pro", priceUsd: 60, effectiveAt: changeOptions.expectedPeriodEnd },
      });
      expect(await planChangeStatus({ prisma, ...value }, { stripe })).toEqual(scheduled);
      expect(await schedulePlanChange(changeOptions, { stripe })).toEqual(scheduled);
      expect(
        await ensureOrganizationBilling(prisma, value.organizationId, new Date(initialTime * 1000)),
      ).toMatchObject({ plan: "plus", allowanceUsd: 10, spentUsd: 0.25 });
      const renewedTime = firstEnd + 7_200;
      await advance(clock.id, renewedTime);
      const renewed = await poll("paid renewal invoice", async () => {
        const current = await stripe.subscriptions.retrieve(subscription.id, {
          expand: ["latest_invoice"],
        });
        const invoice = current.latest_invoice;
        return current.items.data[0]!.current_period_start >= firstEnd &&
          typeof invoice === "object" &&
          invoice?.status === "paid"
          ? current
          : undefined;
      });
      const renewedInvoiceId = objectId(renewed.latest_invoice)!;
      expect(renewed.items.data[0]!.price.id).toBe(prices.pro);
      expect(renewed.latest_invoice).toMatchObject({ status: "paid", amount_paid: 6000 });
      const renewalEvent = await eventFor(
        "invoice.paid",
        customerId,
        (event) => eventObjectId(event) === renewedInvoiceId,
      );
      const delayedRenewal = await eventFor(
        "customer.subscription.updated",
        customerId,
        (event) => {
          const object = event.data.object as Stripe.Subscription;
          return (
            object.id === subscription.id &&
            object.items.data[0]!.current_period_start >= firstEnd &&
            !object.cancel_at_period_end
          );
        },
      );
      await deliver(renewalEvent);
      const renewedAt = new Date(renewedTime * 1000);
      expect(
        await ensureOrganizationBilling(prisma, value.organizationId, renewedAt),
      ).toMatchObject({ plan: "pro", allowanceUsd: 30, spentUsd: 0, reservedUsd: 0 });
      await spend(value, renewedAt);
      await deliver(delayedCreated);
      await deliver(renewalEvent);
      expect(
        await ensureOrganizationBilling(prisma, value.organizationId, renewedAt),
      ).toMatchObject({ plan: "pro", allowanceUsd: 30, spentUsd: 0.25, reservedUsd: 0 });
      await check(
        "scheduled upgrade bills the full target price at renewal and grants its allowance once; replays preserve usage",
      );

      stage = "cancellation effective date";
      const end = renewed.items.data[0]!.current_period_end;
      const cancelOptions = {
        prisma,
        ...value,
        expectedPeriodEnd: new Date(end * 1000).toISOString(),
      };
      await schedulePlanChange({ ...cancelOptions, plan: "plus" }, { stripe });
      expect((await cancelPlanChange({ prisma, ...value }, { stripe })).pendingChange).toBeNull();
      await schedulePlanChange({ ...cancelOptions, plan: "plus" }, { stripe });
      expect(
        await setCancelAtPeriodEnd({ ...cancelOptions, cancel: true }, { stripe }),
      ).toMatchObject({ cancelAtPeriodEnd: true, pendingChange: null });
      expect(
        (await setCancelAtPeriodEnd({ ...cancelOptions, cancel: false }, { stripe }))
          .cancelAtPeriodEnd,
      ).toBe(false);
      await setCancelAtPeriodEnd({ ...cancelOptions, cancel: true }, { stripe });
      await deliver(
        await eventFor("customer.subscription.updated", customerId, (event) => {
          const object = event.data.object as Stripe.Subscription;
          return object.id === subscription.id && object.cancel_at_period_end;
        }),
      );
      expect(
        await ensureOrganizationBilling(prisma, value.organizationId, new Date((end - 1) * 1000)),
      ).toMatchObject({
        plan: "pro",
        allowanceUsd: 30,
        spentUsd: 0.25,
        currentPeriodEnd: new Date(end * 1000),
      });
      await advance(clock.id, end + 1);
      const deleted = await eventFor(
        "customer.subscription.deleted",
        customerId,
        (event) => eventObjectId(event) === subscription.id,
      );
      await deliver(deleted);
      await deliver(delayedRenewal);
      await deliver(deleted);
      expect(
        await ensureOrganizationBilling(prisma, value.organizationId, new Date((end + 1) * 1000)),
      ).toMatchObject({ plan: "free", status: "canceled", allowanceUsd: 1 });
      await check(
        "cancellation preserves paid access until period end; late renewal cannot revive it",
      );
      stage = "failed scheduled renewal";
      const failedValue = await fixture();
      const failedClock = await stripe.testHelpers.testClocks.create({
        frozen_time: initialTime,
        name: `2hands decline ${runId}`,
      });
      manifest.clocks.push(failedClock.id);
      await persist();
      const failedCustomer = await customer(failedValue, failedClock.id);
      const successMethod = await card(failedCustomer);
      const failedSubscription = await stripe.subscriptions.create({
        customer: failedCustomer,
        items: [{ price: prices.plus }],
        default_payment_method: successMethod,
        payment_behavior: "error_if_incomplete",
      });
      const failedInitial = await eventFor("invoice.paid", failedCustomer);
      await deliver(failedInitial);
      const failedEnd = failedSubscription.items.data[0]!.current_period_end;
      await schedulePlanChange(
        {
          prisma,
          ...failedValue,
          plan: "pro",
          expectedPeriodEnd: new Date(failedEnd * 1000).toISOString(),
        },
        { stripe },
      );
      const decline = await stripe.paymentMethods.create({
        type: "card",
        card: { token: "tok_chargeCustomerFail" },
      });
      await stripe.paymentMethods.attach(decline.id, { customer: failedCustomer });
      // The target phase inherits schedule defaults instead of pinning the card
      // used at signup. Replacing the default must affect its renewal attempt.
      const failedLive = await stripe.subscriptions.retrieve(failedSubscription.id);
      const failedSchedule = await stripe.subscriptionSchedules.retrieve(
        objectId(failedLive.schedule)!,
      );
      await stripe.subscriptionSchedules.update(failedSchedule.id, {
        default_settings: { default_payment_method: decline.id },
      });
      await stripe.customers.update(failedCustomer, {
        invoice_settings: { default_payment_method: decline.id },
      });
      await advance(failedClock.id, failedEnd + 7_200);
      const failedEvent = await eventFor("invoice.payment_failed", failedCustomer);
      expect(failedEvent.data.object).toMatchObject({ amount_due: 6000 });
      await deliver(failedEvent);
      await deliver(failedInitial);
      await deliver(failedEvent);
      const failedBilling = await ensureOrganizationBilling(
        prisma,
        failedValue.organizationId,
        new Date((failedEnd + 7_200) * 1000),
      );
      expect(failedBilling.plan).toBe("free");
      expect(failedBilling.allowanceUsd).toBe(1);
      expect(
        await prisma.billingPeriod.count({
          where: { organizationId: failedValue.organizationId, allowanceMicros: 30_000_000n },
        }),
      ).toBe(0);
      await check(
        "a scheduled target phase with a declined renewal grants no paid allowance, including delayed and duplicate events",
      );
      manifest.complete = true;
    } catch (error) {
      // Do not dump SDK request objects (or Checkout URLs / customer payloads) to CI logs.
      const code =
        error instanceof Stripe.errors.StripeError
          ? (error.code ?? error.type)
          : "assertion-or-timeout";
      if (error instanceof Stripe.errors.StripeError) {
        // Keep only bounded, redacted provider diagnostics, never the SDK request,
        // response, headers, credentials or any customer object.
        const message = error.message
          .replace(/\b(?:sk|rk|pk)_(?:live|test)_\S+/g, "[redacted-key]")
          .replace(/https?:\/\/\S+/g, "[redacted-url]")
          .replace(/\b(?:cus|sub|sub_sched|pm|price|prod|in|evt)_[A-Za-z0-9]+/g, "[test-object]")
          .slice(0, 1000);
        await writeFile(
          path.join(directory, "failure.json"),
          JSON.stringify({ code, param: error.param, message }),
          { mode: 0o600 },
        );
      }
      throw new Error(
        `Stripe release gate failed during ${stage} (${code}); private manifest: ${directory}`,
      );
    } finally {
      vi.unstubAllEnvs();
      for (const clock of manifest.clocks)
        await stripe.testHelpers.testClocks
          .del(clock)
          .catch(() => cleanupFailures.push("test clock"));
      for (const customerId of manifest.customers) {
        const current = await stripe.customers
          .retrieve(customerId)
          .catch((error) =>
            error instanceof Stripe.errors.StripeError && error.code === "resource_missing"
              ? { deleted: true as const }
              : undefined,
          );
        if (current && !current.deleted)
          await stripe.customers.del(customerId).catch(() => cleanupFailures.push("test customer"));
        else if (!current) cleanupFailures.push("test customer lookup");
      }
      for (const price of manifest.prices)
        await stripe.prices
          .update(price, { active: false })
          .catch(() => cleanupFailures.push("test price"));
      for (const product of manifest.products)
        await stripe.products
          .update(product, { active: false })
          .catch(() => cleanupFailures.push("test product"));
      for (const value of fixtures) {
        await prisma.organization
          .deleteMany({ where: { id: value.organizationId } })
          .catch(() => cleanupFailures.push("local organization"));
        await prisma.user
          .deleteMany({ where: { id: value.userId } })
          .catch(() => cleanupFailures.push("local user"));
      }
      await prisma.$disconnect();
      await pool.end();
      manifest.cleanupComplete = cleanupFailures.length === 0;
      await persist();
    }
    if (cleanupFailures.length)
      throw new Error(
        `Stripe canary cleanup needs attention (${cleanupFailures.join(", ")}); private manifest: ${directory}`,
      );
    console.log(`Stripe release gate passed; private report: ${directory}`);
  }, 900_000);
});

function eventObjectId(event: Stripe.Event) {
  return "id" in event.data.object ? event.data.object.id : undefined;
}

function objectId(value: string | { id?: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

async function poll<T>(
  label: string,
  read: () => Promise<T | undefined>,
  timeoutMs = 90_000,
  intervalMs = 2_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await read();
    if (result !== undefined) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
