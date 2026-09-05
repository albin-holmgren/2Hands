import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Billing, Bot, Me, ThreadSnapshot } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { testDatabaseUrl } from "./cli/test-database-url.js";
import { sessionCookieHeader } from "./index.js";

const enabled = process.env.VERIFY_HOSTED_ONBOARDING === "1";
const databaseUrl = enabled ? testDatabaseUrl(process.env.TEST_DATABASE_URL) : undefined;
const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY;
if (enabled && (!databaseUrl || !apiKey || process.env.BILLING_ENABLED !== "true")) {
  throw new Error(
    "Hosted onboarding verification requires a disposable TEST_DATABASE_URL, a Gateway key and BILLING_ENABLED=true.",
  );
}

(enabled && databaseUrl && apiKey ? describe : describe.skip)(
  "free hosted onboarding canary",
  () => {
    it("signs up without a user key, completes a task and records the same account allowance", async () => {
      const { createApp } = await import("../../../apps/api/src/app.ts");
      const dataDir = await mkdtemp(path.join(tmpdir(), "2hands-free-canary-"));
      const origin = "http://127.0.0.1:5173";
      const chosen = "openai/gpt-4.1-mini";
      const handles = await createApp({
        databaseUrl,
        realtimeDatabaseUrl: databaseUrl,
        dataDir,
        agentRuntime: "pi",
        sandboxProvider: "fake",
        wakeupDriver: "memory",
        defaultProvider: "vercel-gateway",
        defaultModel: chosen,
        deploymentModelKey: apiKey,
        signupsEnabled: "true",
        signupsLocked: "false",
        signupAllowlist: "",
        webOrigin: origin,
        authUrl: origin,
      });
      try {
        const signup = await handles.app.request("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({
            email: `free-${crypto.randomUUID()}@example.test`,
            name: "Synthetic free account",
            password: "synthetic-test-password-only",
          }),
        });
        expect(signup.status).toBeLessThan(400);
        const cookie = sessionCookieHeader(signup);
        let spaceId: string | undefined;
        const rpc = async <T>(procedure: string, input: unknown = {}): Promise<T> => {
          const response = await handles.app.request(`/rpc/${procedure}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie,
              origin,
              ...(spaceId ? { "x-rakazo-space-id": spaceId } : {}),
            },
            body: JSON.stringify({ json: input }),
          });
          const result = (await response.json()) as { json: T };
          expect(response.status, procedure).toBeLessThan(400);
          return result.json;
        };
        const me = await rpc<Me>("me");
        spaceId = me.spaceId;
        expect(me.needsModel).toBe(false);
        const bot = await rpc<Bot>("onboarding/ensureChiefOfStaff");
        const before = await rpc<Billing>("billing/get");
        expect(before.plan).toBe("free");
        expect(before.allowanceUsd).toBe(1);
        expect(before.spentUsd).toBe(0);
        expect(
          await handles.prisma.userModelCredential.count({ where: { userId: me.userId } }),
        ).toBe(0);
        const { runId } = await rpc<{ runId: string }>("threads/send", {
          botId: bot.id,
          text: "Reply with exactly pong. This is a connectivity check; use no tools.",
        });
        await expect
          .poll(
            async () => {
              const run = await handles.prisma.run.findUniqueOrThrow({ where: { id: runId } });
              if (run.status === "failed") throw new Error(run.error ?? "Canary run failed");
              return run.status;
            },
            { timeout: 60_000, interval: 250 },
          )
          .toBe("completed");
        const run = await handles.prisma.run.findUniqueOrThrow({ where: { id: runId } });
        expect(run).toMatchObject({
          modelProvider: "vercel-gateway",
          modelId: chosen,
          modelFunding: "hosted",
        });
        const thread = await rpc<ThreadSnapshot>("threads/get", { botId: bot.id });
        expect(
          thread.messages.some(
            (message) =>
              message.role === "bot" &&
              message.blocks.some(
                (block) => block.kind === "text" && block.text.toLowerCase().includes("pong"),
              ),
          ),
        ).toBe(true);
        const charges = await handles.prisma.usageReservation.findMany({ where: { runId } });
        expect(charges.length).toBeGreaterThan(0);
        expect(
          charges.every((charge) => charge.status === "settled" && charge.funding === "hosted"),
        ).toBe(true);
        const after = await rpc<Billing>("billing/get");
        expect(after.spentUsd).toBeGreaterThan(0);
        expect(after.remainingUsd).toBeGreaterThan(0);
        expect(after.reservedUsd).toBe(0);
        expect(after.spentUsd + after.remainingUsd).toBeCloseTo(1, 6);
        // A plain response must not allocate a computer or mint another allowance.
        const computers = await handles.prisma.computer.findMany({ where: { userId: me.userId } });
        expect(computers.every((computer) => computer.providerRef === null)).toBe(true);
        const second = await rpc<{ id: string }>("spaces/create", {
          name: "Second synthetic workspace",
        });
        spaceId = second.id;
        const shared = await rpc<Billing>("billing/get");
        expect(shared.spentUsd).toBe(after.spentUsd);
        expect(shared.remainingUsd).toBe(after.remainingUsd);
      } finally {
        await handles.stop();
        await rm(dataDir, { recursive: true, force: true });
      }
    }, 120_000);
  },
);
