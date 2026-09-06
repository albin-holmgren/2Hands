import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { AppContract } from "@rakazo/contracts";

const SPACE_STORAGE_KEY = "rakazo:space-id";

type RpcClientContext = { spaceId?: string | null };

export function selectedSpaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function selectSpace(id: string): boolean {
  try {
    window.localStorage.setItem(SPACE_STORAGE_KEY, id);
    return true;
  } catch {
    try {
      // Write failed but the desired selection is already durable — treat as success.
      return window.localStorage.getItem(SPACE_STORAGE_KEY) === id;
    } catch {
      return false;
    }
  }
}

export function clearSpaceSelection(): void {
  try {
    window.localStorage.removeItem(SPACE_STORAGE_KEY);
  } catch {
    // Ignore storage failures on sign-out / reset paths.
  }
}

/** Adds `x-rakazo-space-id` when a space is selected. */
export function withSpaceHeaders(
  init?: HeadersInit,
  spaceId: string | null = selectedSpaceId(),
): Headers {
  const headers = new Headers(init);
  if (spaceId) headers.set("x-rakazo-space-id", spaceId);
  else headers.delete("x-rakazo-space-id");
  return headers;
}

export function createWorkspaceRpc(spaceId?: string | null, signal?: AbortSignal) {
  const link = new RPCLink<RpcClientContext>({
    url: () =>
      typeof window === "undefined" ? "http://127.0.0.1:5173/rpc" : `${window.location.origin}/rpc`,
    fetch: async (input, init, options) => {
      const request = new Request(input, init);
      const capturedSpace =
        options.context.spaceId === undefined
          ? spaceId === undefined
            ? selectedSpaceId()
            : spaceId
          : options.context.spaceId;
      const response = await fetch(request, {
        headers: withSpaceHeaders(request.headers, capturedSpace),
        credentials: "include",
        signal: signal ? AbortSignal.any([signal, request.signal]) : request.signal,
      });
      if (response.status === 401 && typeof window !== "undefined") {
        window.dispatchEvent(new Event("rakazo:session-unauthorized"));
      }
      return response;
    },
  });
  return createORPCClient<ContractRouterClient<AppContract, RpcClientContext>>(link);
}

export const rpc = createWorkspaceRpc();
