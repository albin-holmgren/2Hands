import { ORPCError } from "@orpc/server";
import { ExecutionError, PlanLimitError } from "@rakazo/core";
import { describe, expect, it } from "vitest";
import { throwExecutionRpcError } from "./execution-errors.js";

describe("execution RPC error boundary", () => {
  it.each([
    [new PlanLimitError("Usage exhausted", "ALLOWANCE_EXHAUSTED"), "FORBIDDEN"],
    [new PlanLimitError("Bot limit reached"), "FORBIDDEN"],
    [
      new ExecutionError("MODEL_UNAVAILABLE", "Reconnect the selected provider"),
      "SERVICE_UNAVAILABLE",
    ],
    [new ExecutionError("COMPUTER_UNAVAILABLE", "Connect a computer"), "SERVICE_UNAVAILABLE"],
  ] as const)("retains the public message and machine code for %s", (failure, status) => {
    try {
      throwExecutionRpcError(failure);
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).toJSON()).toMatchObject({
        code: status,
        message: failure.message,
        data: { errorCode: failure.code },
      });
    }
  });

  it("leaves authorization and unexpected errors untouched", () => {
    for (const failure of [new ORPCError("UNAUTHORIZED"), new Error("private database failure")]) {
      expect(() => throwExecutionRpcError(failure)).toThrow(failure);
    }
  });
});
