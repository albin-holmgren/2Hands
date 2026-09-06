import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSpaceSelection, createWorkspaceRpc, selectedSpaceId, selectSpace } from "./rpc.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("space selection storage", () => {
  it("reports localStorage write failures without throwing", () => {
    const localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => {
        throw new Error("quota exceeded");
      },
    };
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("localStorage", localStorage);

    expect(selectSpace("space-support")).toBe(false);
    expect(() => clearSpaceSelection()).not.toThrow();
    expect(selectedSpaceId()).toBeNull();
  });

  it("treats an already-persisted selection as success when writes fail", () => {
    const localStorage = {
      getItem: (key: string) => (key === "rakazo:space-id" ? "space-support" : null),
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: vi.fn(),
    };
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("localStorage", localStorage);

    expect(selectSpace("space-support")).toBe(true);
    expect(selectSpace("space-other")).toBe(false);
  });

  it("reports when a space selection was persisted", () => {
    const setItem = vi.fn();
    const localStorage = { getItem: () => null, setItem, removeItem: vi.fn() };
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("localStorage", localStorage);

    expect(selectSpace("space-support")).toBe(true);
    expect(setItem).toHaveBeenCalledWith("rakazo:space-id", "space-support");
  });
});

describe("workspace request scope", () => {
  it("keeps a captured workspace on delayed follow-up requests after selection changes", async () => {
    let selected = "personal";
    vi.stubGlobal("window", {
      location: { origin: "https://app.example.test" },
      localStorage: { getItem: () => selected },
    });
    const observed: Array<string | null> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: Request, init: RequestInit) => {
        observed.push(new Headers(init.headers).get("x-rakazo-space-id"));
        return new Response(JSON.stringify({ json: { spaceId: observed.at(-1) } }), {
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const personal = createWorkspaceRpc("personal");
    await personal.me();
    selected = "work";
    await personal.me();
    await createWorkspaceRpc("work").me();
    expect(observed).toEqual(["personal", "personal", "work"]);
  });

  it("propagates workspace disposal to requests instead of continuing into a new scope", async () => {
    vi.stubGlobal("window", { location: { origin: "https://app.example.test" } });
    const controller = new AbortController();
    let requestSignal: AbortSignal | null | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: Request, init: RequestInit) => {
        requestSignal = init.signal;
        return new Response(JSON.stringify({ json: {} }), {
          headers: { "content-type": "application/json" },
        });
      }),
    );
    await createWorkspaceRpc("personal", controller.signal).me();
    controller.abort();
    expect(requestSignal?.aborted).toBe(true);
  });
});
