import * as z from "zod";

export const ExecutionErrorCodeSchema = z.enum([
  "ALLOWANCE_EXHAUSTED",
  "MODEL_UNAVAILABLE",
  "COMPUTER_UNAVAILABLE",
  "PLAN_LIMIT",
]);
export type ExecutionErrorCode = z.infer<typeof ExecutionErrorCodeSchema>;

/** Optional on RPC errors and run failures for compatibility with older clients. */
export const ExecutionErrorDataSchema = z.object({ errorCode: ExecutionErrorCodeSchema });
