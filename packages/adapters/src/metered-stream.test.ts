import {
  type Api,
  type AssistantMessage,
  createAssistantMessageEventStream,
  type Model,
} from "@earendil-works/pi-ai";
import type { AgentRunRequest } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { meteredModelStream } from "./metered-stream.js";

const model = {
  id: "test",
  provider: "hosted",
  api: "openai-completions",
  contextWindow: 100_000,
  maxTokens: 32_000,
  cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1 },
} as Model<Api>;
const message: AssistantMessage = {
  role: "assistant",
  api: model.api,
  provider: model.provider,
  model: model.id,
  content: [{ type: "text", text: "done" }],
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
const context = { messages: [], systemPrompt: "Test" };
function setup() {
  const settle = vi.fn(async () => {});
  const release = vi.fn(async () => {});
  const meter = vi.fn(async () => ({ settle, release }));
  return {
    settle,
    release,
    meter,
    request: { meterModelCall: meter } as unknown as AgentRunRequest,
  };
}
describe("metered model stream", () => {
  it("admits before dispatch, caps output and settles before returning completion", async () => {
    const fixture = setup();
    let completeSettlement!: () => void;
    fixture.settle.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeSettlement = resolve;
        }),
    );
    const stream = vi.fn((_m, _c, options) => {
      expect(fixture.meter).toHaveBeenCalledOnce();
      expect(options.maxTokens).toBe(4096);
      expect(options.maxRetries).toBe(0);
      const events = createAssistantMessageEventStream();
      events.push({ type: "done", reason: "stop", message });
      return events;
    });
    const events = await meteredModelStream(stream, fixture.request, model, context);
    const completion = events.result();
    let finished = false;
    void completion.then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(fixture.settle).toHaveBeenCalledOnce());
    expect(finished).toBe(false);
    completeSettlement();
    expect(await completion).toEqual(message);
    expect(fixture.release).not.toHaveBeenCalled();
  });
  it("never dispatches when reservation is rejected", async () => {
    const fixture = setup();
    fixture.meter.mockRejectedValueOnce(new Error("Allowance exhausted"));
    const stream = vi.fn();
    await expect(meteredModelStream(stream, fixture.request, model, context)).rejects.toThrow(
      "Allowance exhausted",
    );
    expect(stream).not.toHaveBeenCalled();
  });
  it("releases known undispatched cancellation", async () => {
    const fixture = setup();
    const stream = vi.fn();
    await expect(
      meteredModelStream(stream, fixture.request, model, context, { signal: AbortSignal.abort() }),
    ).rejects.toThrow(/canceled/);
    expect(fixture.release).toHaveBeenCalledOnce();
    expect(stream).not.toHaveBeenCalled();
  });
  it("keeps the reservation for an unknown provider outcome", async () => {
    const fixture = setup();
    const stream = vi.fn(() => {
      throw new Error("connection lost");
    });
    const result = await meteredModelStream(stream, fixture.request, model, context);
    expect((await result.result()).errorMessage).toBe("connection lost");
    expect(fixture.release).not.toHaveBeenCalled();
    expect(fixture.settle).not.toHaveBeenCalled();
  });
  it("reserves the full input window for compressed user and tool-result images", async () => {
    for (const role of ["user", "toolResult"] as const) {
      const fixture = setup();
      const image = {
        type: "image" as const,
        data: "tiny-compressed-image",
        mimeType: "image/png",
      };
      const content =
        role === "user"
          ? { role, content: [image], timestamp: 1 }
          : {
              role,
              content: [image],
              toolCallId: "observe-1",
              toolName: "computer_observe",
              isError: false,
              timestamp: 1,
            };
      const stream = vi.fn(() => {
        const events = createAssistantMessageEventStream();
        events.push({ type: "done", reason: "stop", message });
        return events;
      });
      const result = await meteredModelStream(stream, fixture.request, model, {
        messages: [content],
      });
      await result.result();
      expect(fixture.meter).toHaveBeenCalledWith(
        expect.objectContaining({ inputTokenLimit: model.contextWindow }),
      );
    }
  });
  it("does not forward successful completion if its usage cannot be settled", async () => {
    const fixture = setup();
    fixture.settle.mockRejectedValueOnce(new Error("Usage report missing"));
    const stream = vi.fn(() => {
      const events = createAssistantMessageEventStream();
      events.push({ type: "done", reason: "stop", message });
      return events;
    });
    const result = await meteredModelStream(stream, fixture.request, model, context);
    expect((await result.result()).errorMessage).toBe("Usage report missing");
    expect(fixture.release).not.toHaveBeenCalled();
  });
});
