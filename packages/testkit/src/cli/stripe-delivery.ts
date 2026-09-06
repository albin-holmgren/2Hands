import { execFile, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { PLANS } from "@rakazo/core";
import { createDb, ensureOrganizationBilling, reserveUsage, settleUsage } from "@rakazo/db";
import { createCheckoutUrl, createStripeClient } from "../../../../apps/api/src/stripe-billing.js";
import { mountStripeWebhook } from "../../../../apps/api/src/stripe-webhook.js";
import { runProcess } from "./process.js";
import { stripeCanaryConfig } from "./stripe-canary-config.js";
import { startStripeDeliveryServer } from "./stripe-delivery-server.js";

const execute = promisify(execFile);
const events = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

async function main() {
  process.env.RAKAZO_IGNORE_ENV_FILES = "1";
  process.env.BILLING_ENABLED = "true";
  const config = stripeCanaryConfig(process.env);
  const accountId = process.env.STRIPE_TEST_ACCOUNT_ID?.trim();
  if (!accountId || !/^acct_[A-Za-z0-9]+$/.test(accountId))
    throw new Error("STRIPE_TEST_ACCOUNT_ID must identify the existing dedicated sandbox.");
  const stripeBin = process.env.STRIPE_CLI_BIN || "stripe";
  const tunnelBin = process.env.CLOUDFLARED_BIN || "cloudflared";
  const commandEnv = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR };
  for (const executable of [stripeBin, tunnelBin]) {
    await execute(executable, ["--version"], {
      env: commandEnv,
      timeout: 10_000,
      maxBuffer: 16_384,
    }).catch(() => {
      throw new Error("Stripe CLI and official cloudflared must be installed before this gate.");
    });
  }
  const stripe = createStripeClient(config.secretKey)!;
  const [balance, account] = await Promise.all([
    stripe.balance.retrieve(),
    stripe.accounts.retrieve(),
  ]).catch(() => {
    throw new Error("Sandbox identity could not be read; verify its key and read permissions.");
  });
  if (balance.livemode !== false || account.id !== accountId)
    throw new Error("The key does not belong to the explicitly selected Stripe sandbox.");
  await runProcess("pnpm", ["--filter", "@rakazo/db", "exec", "prisma", "migrate", "deploy"], {
    ...process.env,
    RAKAZO_IGNORE_ENV_FILES: "1",
    DATABASE_URL: config.databaseUrl,
  });

  const directory = await mkdtemp(path.join(tmpdir(), "2hands-stripe-delivery-"));
  const id = randomUUID();
  const actor = {
    organizationId: `stripe-delivery-org-${id}`,
    userId: `stripe-delivery-user-${id}`,
    spaceId: `stripe-delivery-space-${id}`,
  };
  const manifest = {
    runId: id,
    accountId,
    ...actor,
    endpointId: "",
    customerId: "",
    checkoutId: "",
    productId: "",
    priceId: "",
    webhookUrl: "",
    deliveries: [] as Array<{ id: string; type: string; count: number }>,
    checks: [] as string[],
    complete: false,
    cleanupComplete: false,
    cleanupFailures: [] as string[],
  };
  const persist = () =>
    writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });
  const checked = async (name: string) => {
    manifest.checks.push(name);
    await persist();
    console.log(`Stripe delivery gate: ${name}`);
  };
  await persist();
  const { prisma, pool } = createDb(config.databaseUrl);
  const controller = new AbortController();
  const abort = () => controller.abort();
  const deadline = setTimeout(abort, 15 * 60_000);
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  let stage = "setup";
  let server: Awaited<ReturnType<typeof startStripeDeliveryServer>> | undefined;
  let tunnel: Awaited<ReturnType<typeof startTunnel>> | undefined;
  const cleanup = async (name: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch {
      manifest.cleanupFailures.push(name);
    }
  };
  try {
    // Resolve the API's declared Hono dependency; the runner uses the production webhook unchanged.
    const apiRequire = createRequire(new URL("../../../../apps/api/package.json", import.meta.url));
    const { Hono } = await import(apiRequire.resolve("hono"));
    const app: Parameters<typeof mountStripeWebhook>[0] = new Hono();
    const dependencies = { stripe, secret: "", enabled: true };
    mountStripeWebhook(app, prisma, dependencies);
    const randomPath = `/stripe-delivery/${randomBytes(24).toString("hex")}`;
    server = await startStripeDeliveryServer({
      path: randomPath,
      webhook: (request) => app.fetch(request),
      delivered: (body, status) => {
        if (status !== 200) return;
        const event = JSON.parse(body) as {
          id?: string;
          type?: string;
          livemode?: boolean;
          data?: { object?: { customer?: string } };
        };
        if (
          event.livemode !== false ||
          !event.id?.startsWith("evt_") ||
          !event.type ||
          !manifest.customerId ||
          event.data?.object?.customer !== manifest.customerId
        )
          return;
        const seen = manifest.deliveries.find((delivery) => delivery.id === event.id);
        if (seen) seen.count++;
        else if (manifest.deliveries.length < 100)
          manifest.deliveries.push({ id: event.id, type: event.type, count: 1 });
      },
    });
    stage = "temporary HTTPS tunnel";
    tunnel = await startTunnel(tunnelBin, server.origin, directory, commandEnv, controller.signal);
    manifest.webhookUrl = `${tunnel.origin}${randomPath}`;
    await persist();
    await poll(
      async () => {
        const response = await fetch(manifest.webhookUrl, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        }).catch(() => undefined);
        await response?.body?.cancel();
        return response?.status === 400;
      },
      controller.signal,
      60_000,
    );

    stage = "registered sandbox webhook";
    const endpoint = await stripe.webhookEndpoints.create({
      url: manifest.webhookUrl,
      enabled_events: [...events],
      description: "2hands disposable HTTPS delivery gate",
      metadata: { canaryRun: id },
    });
    manifest.endpointId = endpoint.id;
    await persist();
    if (endpoint.livemode || !endpoint.secret) throw new Error("Invalid sandbox destination");
    dependencies.secret = endpoint.secret;
    const unsigned = await fetch(manifest.webhookUrl, {
      method: "POST",
      body: "{}",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    await unsigned.body?.cancel();
    if (unsigned.status !== 400) throw new Error("Unsigned public requests must be rejected");
    await checked("public HTTPS destination requires a Stripe signature");

    stage = "synthetic checkout setup";
    const product = await stripe.products.create({
      name: "2hands Plus delivery test",
      metadata: { canaryRun: id },
    });
    manifest.productId = product.id;
    await persist();
    const price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: PLANS.plus.priceUsd * 100,
      recurring: { interval: "month" },
      metadata: { canaryRun: id },
    });
    manifest.priceId = price.id;
    await persist();
    if (price.livemode) throw new Error("A test price is required");
    process.env.STRIPE_PRICE_PLUS = price.id;
    process.env.STRIPE_PRICE_PRO = "";
    process.env.STRIPE_PRICE_ULTRA = "";
    await prisma.user.create({
      data: { id: actor.userId, name: "Delivery Test", email: `${actor.userId}@example.test` },
    });
    await prisma.organization.create({
      data: {
        id: actor.organizationId,
        name: "Delivery Test",
        slug: actor.organizationId,
        createdAt: new Date(),
      },
    });
    await prisma.member.create({
      data: {
        id: randomUUID(),
        organizationId: actor.organizationId,
        userId: actor.userId,
        role: "owner",
        createdAt: new Date(),
      },
    });
    await prisma.space.create({
      data: { id: actor.spaceId, organizationId: actor.organizationId, name: "Payment Test" },
    });
    await prisma.spaceMember.create({
      data: { id: randomUUID(), ...actor, role: "owner", createdAt: new Date() },
    });
    await ensureOrganizationBilling(prisma, actor.organizationId);
    // Bind and record this newly created customer before exposing a Checkout link.
    const customer = await stripe.customers.create(
      {
        email: `${actor.userId}@example.test`,
        name: "2hands synthetic delivery check",
        metadata: { canaryRun: id, organizationId: actor.organizationId },
      },
      { idempotencyKey: `${id}:customer` },
    );
    manifest.customerId = customer.id;
    await persist();
    if (customer.livemode) throw new Error("A test customer is required");
    await prisma.organizationBilling.update({
      where: { organizationId: actor.organizationId },
      data: { stripeCustomerId: customer.id },
    });
    const checkoutUrl = await createCheckoutUrl(
      {
        prisma,
        ...actor,
        email: `${actor.userId}@example.test`,
        plan: "plus",
        webOrigin: "http://127.0.0.1:5173",
      },
      { stripe },
    );
    const sessions = await stripe.checkout.sessions.list({ customer: customer.id, status: "open" });
    if (sessions.data.length !== 1 || sessions.has_more)
      throw new Error("Expected one synthetic Checkout");
    manifest.checkoutId = sessions.data[0]!.id;
    await persist();
    const initial = await ensureOrganizationBilling(prisma, actor.organizationId);
    if (initial.plan !== "free" || initial.allowanceUsd !== 1)
      throw new Error("Unpaid checkout granted allowance");
    const checkoutFile = path.join(directory, "checkout-url.txt");
    await writeFile(checkoutFile, `${checkoutUrl}\n`, { mode: 0o600 });
    console.log(
      `Complete the synthetic Checkout in ${checkoutFile} with Stripe's 4242 test card. Waiting up to 10 minutes.`,
    );

    stage = "real Stripe HTTPS delivery";
    await poll(
      async () => {
        const row = await ensureOrganizationBilling(prisma, actor.organizationId);
        const delivered = manifest.deliveries.find(
          (event) => event.type === "checkout.session.completed",
        );
        return row.plan === "plus" && row.allowanceUsd === 10 && Boolean(delivered);
      },
      controller.signal,
      600_000,
    );
    const session = await stripe.checkout.sessions.retrieve(manifest.checkoutId);
    if (session.status !== "complete" || session.payment_status !== "paid" || session.livemode)
      throw new Error("Completed paid test Checkout was not confirmed");
    await checked(
      "Stripe delivered the paid Checkout to registered HTTPS; route returned 200 and granted $10",
    );
    const delivered = manifest.deliveries.find(
      (event) => event.type === "checkout.session.completed",
    )!;
    await poll(
      async () => (await stripe.events.retrieve(delivered.id)).pending_webhooks === 0,
      controller.signal,
      90_000,
    );
    await checked("Stripe confirms no pending webhook deliveries for the paid Checkout event");
    const hold = await reserveUsage(prisma, {
      ...actor,
      operationKey: `${id}:synthetic-usage`,
      amountUsd: 0.5,
      kind: "ai",
      funding: "hosted",
    });
    await settleUsage(prisma, { reservationId: hold.id, actualAmountUsd: 0.25 });
    const before = delivered.count;
    stage = "official Stripe redelivery";
    for (let index = 0; index < 2; index++) {
      await execute(
        stripeBin,
        ["events", "resend", delivered.id, "--webhook-endpoint", endpoint.id],
        {
          env: { ...commandEnv, STRIPE_API_KEY: config.secretKey },
          timeout: 30_000,
          maxBuffer: 65_536,
        },
      );
    }
    await poll(async () => delivered.count >= before + 2, controller.signal, 90_000);
    const final = await ensureOrganizationBilling(prisma, actor.organizationId);
    const deduped = await prisma.billingProviderEvent.count({
      where: { id: `stripe:${delivered.id}` },
    });
    if (
      deduped !== 1 ||
      final.plan !== "plus" ||
      final.allowanceUsd !== 10 ||
      final.spentUsd !== 0.25 ||
      final.reservedUsd !== 0
    )
      throw new Error("Redelivery changed settled usage or duplicated the billing event");
    await checked(
      "two real Stripe redeliveries returned 200; one billing event retained $0.25 spent usage",
    );
    manifest.complete = true;
  } catch {
    throw new Error(`Stripe delivery gate failed during ${stage}; private manifest: ${directory}`);
  } finally {
    clearTimeout(deadline);
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
    if (manifest.endpointId)
      await cleanup("webhook destination", () => stripe.webhookEndpoints.del(manifest.endpointId));
    if (manifest.checkoutId)
      await cleanup("open Checkout", async () => {
        const session = await stripe.checkout.sessions.retrieve(manifest.checkoutId);
        if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      });
    if (manifest.customerId)
      await cleanup("test customer", () => stripe.customers.del(manifest.customerId));
    if (manifest.priceId)
      await cleanup("test price", () => stripe.prices.update(manifest.priceId, { active: false }));
    if (manifest.productId)
      await cleanup("test product", () =>
        stripe.products.update(manifest.productId, { active: false }),
      );
    await cleanup("local organization", () =>
      prisma.organization.deleteMany({ where: { id: actor.organizationId } }),
    );
    await cleanup("local user", () => prisma.user.deleteMany({ where: { id: actor.userId } }));
    if (tunnel) await cleanup("temporary tunnel", () => tunnel!.stop());
    if (server) await cleanup("local webhook server", () => server!.close());
    await cleanup("local database connections", async () => {
      await prisma.$disconnect();
      await pool.end();
    });
    manifest.cleanupComplete = manifest.cleanupFailures.length === 0;
    await persist();
  }
  if (!manifest.cleanupComplete)
    throw new Error(`Stripe delivery cleanup needs attention; private manifest: ${directory}`);
  console.log(`Registered Stripe HTTPS delivery gate passed; private manifest: ${directory}`);
}

async function poll(read: () => Promise<boolean>, signal: AbortSignal, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    if (await read()) return;
    await delay(1000, undefined, { signal });
  }
  throw new Error("Stripe delivery gate timed out");
}

async function startTunnel(
  executable: string,
  origin: string,
  directory: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
) {
  const configFile = path.join(directory, "cloudflared.yml");
  await writeFile(configFile, "{}\n", { mode: 0o600 });
  const child = spawn(
    executable,
    ["tunnel", "--config", configFile, "--no-autoupdate", "--protocol", "http2", "--url", origin],
    {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    },
  );
  let output = "";
  let publicOrigin: string | undefined;
  let failed = false;
  const onOutput = (chunk: Buffer) => {
    output = (output + chunk.toString("utf8")).slice(-65_536);
    publicOrigin ??= output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
  };
  child.stdout.on("data", onOutput);
  child.stderr.on("data", onOutput);
  child.on("error", () => {
    failed = true;
  });
  child.on("exit", () => {
    failed = true;
  });
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      const deadline = Date.now() + 5000;
      while (child.exitCode === null && child.signalCode === null && Date.now() < deadline)
        await delay(50);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        const killedBy = Date.now() + 2000;
        while (child.exitCode === null && child.signalCode === null && Date.now() < killedBy)
          await delay(50);
        if (child.exitCode === null && child.signalCode === null)
          throw new Error("Temporary tunnel shutdown could not be confirmed");
      }
    }
    await writeFile(path.join(directory, "cloudflared.log"), output, { mode: 0o600 });
  };
  try {
    await poll(
      async () => {
        if (failed) throw new Error("Temporary HTTPS tunnel stopped");
        return Boolean(publicOrigin);
      },
      signal,
      45_000,
    );
    return { origin: publicOrigin!, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

main().catch((error) => {
  // Never print Stripe SDK objects, credentials, Checkout URLs or tunnel URLs.
  console.error(error instanceof Error ? error.message : "Stripe delivery check failed");
  process.exitCode = 1;
});
