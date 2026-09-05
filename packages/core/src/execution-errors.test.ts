import { describe, expect, it } from "vitest";
import { runFailureCode, runFailureError } from "./events.js";
import {
  decodeExecutionError,
  ExecutionError,
  executionErrorCode,
  executionErrorFromResponse,
  persistExecutionError,
} from "./execution-errors.js";

describe("execution failure recovery metadata", () => {
  it.each([
    "ALLOWANCE_EXHAUSTED",
    "MODEL_UNAVAILABLE",
    "COMPUTER_UNAVAILABLE",
    "PLAN_LIMIT",
  ] as const)("preserves %s through persistence, events, and RPC clients", (code) => {
    const failure = new ExecutionError(code, "Reconnect and try again.");
    const stored = persistExecutionError(failure.message, executionErrorCode(failure));
    const payload = decodeExecutionError(stored);
    expect(payload).toEqual({ error: failure.message, errorCode: code });
    expect(runFailureCode({ type: "run.failed", payload })).toBe(code);
    expect(runFailureError({ type: "run.failed", payload })).toBe(failure.message);
    expect(
      executionErrorFromResponse(
        { json: { message: failure.message, data: { errorCode: code } } },
        "Failed",
      ),
    ).toMatchObject({ message: failure.message, code });
    expect(persistExecutionError(stored, code)).toBe(stored);
  });

  it.each([
    "  legacy error: unchanged  ",
    "PAYMENT_FAILED: provider declined",
    "Model unavailable; allowance exhausted.",
    "MODEL_UNAVAILABLE without a separator",
    "prefix MODEL_UNAVAILABLE: is ordinary prose",
  ])("keeps unclassified stored text intact: %s", (message) => {
    expect(persistExecutionError(message)).toBe(message);
    expect(decodeExecutionError(message)).toEqual({ error: message });
    expect(executionErrorCode(new Error(message))).toBeUndefined();
  });

  it("does not classify unknown metadata or non-failure events", () => {
    expect(executionErrorCode({ errorCode: "PAYMENT_FAILED" })).toBeUndefined();
    expect(
      runFailureCode({ type: "run.started", payload: { errorCode: "PLAN_LIMIT" } }),
    ).toBeUndefined();
    expect(
      executionErrorFromResponse({ error: { message: "Old server error" } }, "Failed"),
    ).toMatchObject({ message: "Old server error" });
    expect(executionErrorFromResponse(null, "Failed").message).toBe("Failed");
  });
});
