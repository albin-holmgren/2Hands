import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { assertBillingOwner, planForPriceId } from "./stripe-billing.js";

describe("billing authorization", () => {
  it("requires organization ownership, even if the user owns a space", async () => {
    const prisma = {
      space: { findUniqueOrThrow: vi.fn(async () => ({ organizationId: "org-1" })) },
      member: { findUnique: vi.fn(async () => ({ role: "member" })) },
    };
    await expect(
      assertBillingOwner(prisma as unknown as PrismaClient, "space-1", "member-1"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.member.findUnique).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: "org-1", userId: "member-1" } },
      select: { role: true },
    });
  });

  it("allows the organization owner", async () => {
    const prisma = {
      space: { findUniqueOrThrow: vi.fn(async () => ({ organizationId: "org-1" })) },
      member: { findUnique: vi.fn(async () => ({ role: "owner" })) },
    };
    expect(await assertBillingOwner(prisma as unknown as PrismaClient, "space-1", "owner-1")).toBe(
      "org-1",
    );
  });

  it("maps only configured Stripe prices to paid plans", () => {
    const env = {
      STRIPE_PRICE_PLUS: "price-plus",
      STRIPE_PRICE_PRO: "price-pro",
      STRIPE_PRICE_ULTRA: "price-ultra",
    };
    expect(planForPriceId("price-plus", env)).toBe("plus");
    expect(planForPriceId("unrecognized", env)).toBe("free");
  });
});

// Shared test entrypoint keeps database transaction fixtures behind their package boundary.
import { billingTestStore } from "@rakazo/db/testing/billing-store";
import Stripe from "stripe";
import { afterEach } from "vitest";
import { createCheckoutUrl } from "./stripe-billing.js";

function checkoutFixture() {
  vi.stubEnv("STRIPE_PRICE_PLUS", "price-plus");
  vi.stubEnv("STRIPE_PRICE_PRO", "price-pro");
  const store = billingTestStore();
  const prisma = {
    ...store.prisma,
    member: { findUnique: vi.fn(async () => ({ role: "owner" })) },
  } as unknown as PrismaClient;
  const stripe = new Stripe("sk_test_example");
  const open: Stripe.Checkout.Session[] = [];
  vi.spyOn(stripe.customers, "create").mockResolvedValue({
    id: "customer-example",
  } as Stripe.Response<Stripe.Customer>);
  const subscriptions = vi
    .spyOn(stripe.subscriptions, "list")
    .mockResolvedValue({ data: [], has_more: false } as unknown as Stripe.Response<
      Stripe.ApiList<Stripe.Subscription>
    >);
  vi.spyOn(stripe.checkout.sessions, "list").mockImplementation(
    async () =>
      ({ data: [...open], has_more: false }) as unknown as Stripe.Response<
        Stripe.ApiList<Stripe.Checkout.Session>
      >,
  );
  const expire = vi.spyOn(stripe.checkout.sessions, "expire").mockImplementation(async (id) => {
    const index = open.findIndex((session) => session.id === id);
    const [session] = open.splice(index, 1);
    return { ...session, status: "expired" } as Stripe.Response<Stripe.Checkout.Session>;
  });
  const create = vi
    .spyOn(stripe.checkout.sessions, "create")
    .mockImplementation(async (parameters) => {
      const id = `checkout-${open.length + create.mock.calls.length}`;
      const session = {
        id,
        url: `https://billing.example.test/${id}`,
        mode: "subscription",
        status: "open",
        metadata: parameters?.metadata,
      } as Stripe.Checkout.Session;
      open.push(session);
      return session as Stripe.Response<Stripe.Checkout.Session>;
    });
  vi.spyOn(stripe.billingPortal.sessions, "create").mockResolvedValue({
    url: "https://billing.example.test/portal",
  } as Stripe.Response<Stripe.BillingPortal.Session>);
  const options = {
    prisma,
    spaceId: "space-1",
    userId: "user-1",
    email: "owner@example.test",
    plan: "plus" as const,
    webOrigin: "https://app.example.test",
  };
  return { options, stripe, open, create, expire, subscriptions };
}

afterEach(() => vi.unstubAllEnvs());

describe("serialized checkout", () => {
  it("reuses one open session for concurrent requests to the same plan", async () => {
    const fixture = checkoutFixture();
    const urls = await Promise.all(
      [1, 2, 3].map(() => createCheckoutUrl(fixture.options, fixture)),
    );
    expect(new Set(urls).size).toBe(1);
    expect(fixture.create).toHaveBeenCalledOnce();
    expect(fixture.open).toHaveLength(1);
  });

  it("expires the previous plan checkout before creating a different one", async () => {
    const fixture = checkoutFixture();
    await Promise.all([
      createCheckoutUrl(fixture.options, fixture),
      createCheckoutUrl({ ...fixture.options, plan: "pro" }, fixture),
    ]);
    expect(fixture.create).toHaveBeenCalledTimes(2);
    expect(fixture.expire).toHaveBeenCalledOnce();
    expect(fixture.open).toHaveLength(1);
    expect(fixture.open[0]?.metadata?.plan).toBe("pro");
  });

  it("routes an existing subscription to the portal even before the webhook arrives", async () => {
    const fixture = checkoutFixture();
    fixture.subscriptions.mockResolvedValue({
      data: [{ id: "subscription-example", status: "active" }],
      has_more: false,
    } as unknown as Stripe.Response<Stripe.ApiList<Stripe.Subscription>>);
    expect(await createCheckoutUrl(fixture.options, fixture)).toBe(
      "https://billing.example.test/portal",
    );
    expect(fixture.create).not.toHaveBeenCalled();
  });
});
