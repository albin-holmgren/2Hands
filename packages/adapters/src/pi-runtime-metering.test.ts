import {
  type Api,
  type AssistantMessage,
  type Context,
  createAssistantMessageEventStream,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { builtinAgentTools } from "./builtin-tools.js";

const fixture = vi.hoisted(() => ({
  order: [] as string[],
  dispatches: [] as Array<{ model: { provider: string; id: string }; apiKey?: string }>,
}));
const selected = {
  provider: "test",
  id: "chosen",
  api: "openai-completions",
  input: ["text"],
  reasoning: false,
  contextWindow: 100000,
  maxTokens: 16000,
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
} as Model<Api>;
vi.mock("@earendil-works/pi-ai/providers/all", () => ({
  builtinModels: () => ({
    setProvider: vi.fn(),
    getModel: (provider: string, id: string) =>
      provider === "test" && id === "chosen" ? selected : undefined,
    streamSimple: (model: Model<Api>, _context: Context, options?: SimpleStreamOptions) => {
      fixture.order.push("dispatch");
      fixture.dispatches.push({ model, apiKey: options?.apiKey });
      const events = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: "assistant",
        api: model.api,
        provider: model.provider,
        model: model.id,
        content: [{ type: "text", text: "Finished" }],
        stopReason: "stop",
        timestamp: 1,
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      events.push({ type: "done", reason: "stop", message });
      return events;
    },
  }),
}));
vi.mock("./pi-local-provider.js", () => ({ registerLocalProvider: (models: unknown) => models }));
vi.mock("./pi-openai-compatible-provider.js", () => ({
  OPENAI_COMPATIBLE_PROVIDER_ID: "openai-compatible",
  registerOpenAiCompatibleCatalog: (models: unknown) => models,
  registerOpenAiCompatibleRuntime: (models: unknown) => models,
}));
vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: class {
    state = { messages: [] as AssistantMessage[], errorMessage: undefined };
    constructor(
      private options: {
        initialState: {
          model: Model<Api>;
          tools: Array<{
            name: string;
            execute: (id: string, args: Record<string, unknown>) => Promise<unknown>;
          }>;
        };
        getApiKey: (provider: string) => Promise<string | undefined>;
        streamFn: (
          model: Model<Api>,
          context: Context,
          options: SimpleStreamOptions,
        ) => Promise<ReturnType<typeof createAssistantMessageEventStream>>;
      },
    ) {}
    subscribe() {}
    async prompt(prompt: string) {
      const model = this.options.initialState.model;
      const events = await this.options.streamFn(
        model,
        { messages: [{ role: "user", content: prompt, timestamp: 1 }] },
        { apiKey: await this.options.getApiKey(model.provider) },
      );
      this.state.messages.push(await events.result());
      await this.options.initialState.tools
        .find((tool) => tool.name === "run_subagent")
        ?.execute("child", {
          name: "helper",
          task: "Summarize",
          provider: "different-provider",
          model: "expensive-model",
          apiKey: "untrusted-override",
        });
    }
    async waitForIdle() {}
    abort() {}
  },
}));

import { PiAgentRuntime } from "./pi-runtime.js";

beforeEach(() => {
  fixture.order.length = 0;
  fixture.dispatches.length = 0;
});
describe("nested model metering", () => {
  it("admits both calls and keeps the parent model, key, and meter for subagent arguments", async () => {
    const meter = vi.fn(async () => {
      fixture.order.push("reserve");
      return {
        settle: async () => {
          fixture.order.push("settle");
        },
        release: vi.fn(async () => {}),
      };
    });
    const runtime = new PiAgentRuntime();
    for await (const _event of runtime.run(
      {
        botId: "bot",
        threadId: "thread",
        runId: "run",
        prompt: "Summarize",
        instructions: "",
        history: [],
        tools: builtinAgentTools,
        model: { provider: "test", id: "chosen", apiKey: "fake-parent-key", funding: "hosted" },
        meterModelCall: meter,
      },
      {
        operationId: "op",
        traceId: "trace",
        spaceId: "space",
        userId: "user",
        signal: new AbortController().signal,
      },
    )) {
      /* consume */
    }
    expect(fixture.order).toEqual([
      "reserve",
      "dispatch",
      "settle",
      "reserve",
      "dispatch",
      "settle",
    ]);
    expect(meter).toHaveBeenCalledTimes(2);
    expect(
      fixture.dispatches.map(({ model, apiKey }) => ({
        provider: model.provider,
        id: model.id,
        apiKey,
      })),
    ).toEqual([
      { provider: "test", id: "chosen", apiKey: "fake-parent-key" },
      { provider: "test", id: "chosen", apiKey: "fake-parent-key" },
    ]);
  });
});
