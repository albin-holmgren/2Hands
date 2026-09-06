import { type ExecutionErrorCode, ExecutionErrorCodeSchema } from "@rakazo/contracts";

export class ExecutionError extends Error {
  constructor(
    readonly code: ExecutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}

/** Native HTTP clients and adapters preserve the same error data as the typed RPC client. */
export function executionErrorFromResponse(body: unknown, fallback: string): Error {
  const envelope = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const candidate = envelope.error ?? envelope.json ?? envelope;
  const failure =
    candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : {};
  const message = typeof failure.message === "string" ? failure.message : fallback;
  const code = executionErrorCode(failure.data);
  return code ? new ExecutionError(code, message) : new Error(message);
}

/** Decode only explicit, known codes. Never infer recovery actions from provider prose. */
export function executionErrorCode(error: unknown): ExecutionErrorCode | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as {
    errorCode?: unknown;
    code?: unknown;
    error?: unknown;
    message?: unknown;
  };
  const parsed = ExecutionErrorCodeSchema.safeParse(value.errorCode ?? value.code);
  if (parsed.success) return parsed.data;
  const message = typeof value.error === "string" ? value.error : value.message;
  return typeof message === "string" ? decodeExecutionError(message).errorCode : undefined;
}

/** Existing run/attempt error columns retain their text format; new metadata survives reloads. */
export function persistExecutionError(message: string, errorCode?: ExecutionErrorCode): string {
  if (!errorCode) return message;
  const decoded = decodeExecutionError(message);
  return `${errorCode}: ${decoded.error}`;
}

export function decodeExecutionError(message: string): {
  error: string;
  errorCode?: ExecutionErrorCode;
} {
  const separator = message.indexOf(": ");
  if (separator < 0) return { error: message };
  const parsed = ExecutionErrorCodeSchema.safeParse(message.slice(0, separator));
  return parsed.success
    ? { error: message.slice(separator + 2), errorCode: parsed.data }
    : { error: message };
}
