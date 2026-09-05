import { PiAgentRuntime } from "@rakazo/adapters";
import { describe, expect, it } from "vitest";

const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY;
const live = process.env.VERIFY_PROVIDERS === "1" && Boolean(apiKey);
(live ? describe : describe.skip)("hosted model canary", () => {
  it("invokes the selected model and reports bounded metered usage", async () => {
    const runtime = new PiAgentRuntime();
    const chosen = "openai/gpt-4.1-mini";
    let output = "";
    let chargedUsage: { input: number; output: number } | undefined;
    let admissions = 0;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      for await (const event of runtime.run(
        {
          botId: "synthetic-canary",
          threadId: "synthetic-canary",
          runId: `canary-${Date.now()}`,
          prompt: "Reply with exactly pong.",
          instructions: "This is a bounded connectivity check. Use no tools.",
          history: [],
          tools: [],
          model: { provider: "vercel-gateway", id: chosen, apiKey, funding: "hosted" },
          meterModelCall: async (request) => {
            expect(request.provider).toBe("vercel-gateway");
            expect(request.model).toBe(chosen);
            expect(request.outputTokenLimit).toBeLessThanOrEqual(7168);
            expect(request.rates.input).toBeGreaterThan(0);
            expect(++admissions).toBe(1);
            return {
              settle: async (usage) => {
                chargedUsage = usage;
              },
              release: async () => {},
            };
          },
        },
        {
          operationId: "canary",
          traceId: "canary",
          spaceId: "synthetic-canary",
          userId: "synthetic-canary",
          signal: controller.signal,
        },
      )) {
        if (event.type === "text") output += event.text;
      }
      expect(output.trim().toLowerCase()).toBe("pong");
      expect(chargedUsage?.input).toBeGreaterThan(0);
      expect(chargedUsage?.output).toBeGreaterThan(0);
    } finally {
      clearTimeout(timer);
    }
  }, 60_000);
});
