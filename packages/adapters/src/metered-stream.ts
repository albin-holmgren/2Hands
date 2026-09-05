import type { StreamFn } from "@earendil-works/pi-agent-core";
import {
  type Api,
  type AssistantMessage,
  type Context,
  createAssistantMessageEventStream,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type { AgentRunRequest } from "@rakazo/adapter-kit";

/** Settle before forwarding the terminal event, so another tool/model step cannot race billing. */
export async function meteredModelStream(
  stream: StreamFn,
  request: AgentRunRequest,
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) {
  if (!request.meterModelCall) return stream(model, context, options);
  const maxTokens = Math.min(options?.maxTokens ?? 4096, 4096, model.maxTokens);
  const boundedOptions = {
    ...options,
    maxTokens,
    maxRetries: 0,
    thinkingBudgets: { minimal: 512, low: 1024, medium: 2048, high: 3072, xhigh: 3072 },
  };
  // UTF-8 bounds text tokens, but a highly compressed image can expand into many
  // more vision tokens. Without provider-specific image accounting, hold the
  // entire admitted context window for image-bearing requests.
  const hasImages = context.messages.some(
    (message) =>
      Array.isArray(message.content) && message.content.some((part) => part.type === "image"),
  );
  const inputTokenLimit = hasImages
    ? model.contextWindow
    : Math.min(
        model.contextWindow,
        new TextEncoder().encode(JSON.stringify(context)).byteLength + 4096,
      );
  const reservation = await request.meterModelCall({
    provider: model.provider,
    model: model.id,
    inputTokenLimit,
    outputTokenLimit: Math.min(model.maxTokens, maxTokens + 3072),
    rates: model.cost,
  });
  if (options?.signal?.aborted) {
    await reservation.release();
    throw new Error("Request canceled before model dispatch.");
  }
  const result = createAssistantMessageEventStream();
  void (async () => {
    let terminal: AssistantMessage | undefined;
    try {
      const source = await stream(model, context, boundedOptions);
      for await (const event of source) {
        if (event.type === "done" || event.type === "error") {
          terminal = event.type === "done" ? event.message : event.error;
          // Provider errors and disconnects may omit final usage. Keep the hold until
          // reconciliation instead of treating a missing/partial report as free usage.
          if (event.type === "done") await reservation.settle(terminal.usage);
        }
        result.push(event);
      }
      if (!terminal) throw new Error("Model connection ended before usage could be confirmed.");
    } catch (error) {
      // After dispatch an unknown outcome retains its reservation; releasing it could overspend.
      const failed: AssistantMessage = {
        role: "assistant",
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        stopReason: "error",
        timestamp: Date.now(),
        errorMessage: error instanceof Error ? error.message : "Model request failed.",
        usage: terminal?.usage ?? {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      result.push({ type: "error", reason: "error", error: failed });
    }
  })();
  return result;
}
