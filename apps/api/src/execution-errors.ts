import { ORPCError } from "@orpc/server";
import { ExecutionErrorDataSchema } from "@rakazo/contracts";
import { ExecutionError } from "@rakazo/core";

/** Preserve public recovery metadata at the RPC boundary without exposing unknown failures. */
export function throwExecutionRpcError(error: unknown): never {
  if (!(error instanceof ExecutionError)) throw error;
  const status =
    error.code === "PLAN_LIMIT" || error.code === "ALLOWANCE_EXHAUSTED"
      ? "FORBIDDEN"
      : "SERVICE_UNAVAILABLE";
  throw new ORPCError(status, {
    message: error.message,
    data: ExecutionErrorDataSchema.parse({ errorCode: error.code }),
  });
}
