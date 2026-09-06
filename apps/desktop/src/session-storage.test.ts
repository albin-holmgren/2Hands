import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const contents = vi.hoisted(() => ({
  loadURL: vi.fn(),
  getURL: vi.fn(),
  executeJavaScript: vi.fn(),
  isDestroyed: vi.fn(),
  close: vi.fn(),
  stop: vi.fn(),
  debugger: {
    attach: vi.fn(),
    on: vi.fn(),
    sendCommand: vi.fn(),
    removeListener: vi.fn(),
    isAttached: vi.fn(),
    detach: vi.fn(),
  },
}));
const createView = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({
  WebContentsView: class {
    webContents = contents;
    constructor(options: unknown) {
      createView(options);
    }
  },
}));

import { defaultSessionHasOriginData } from "./session-storage.js";

describe("legacy session storage probe", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    contents.loadURL.mockResolvedValue(undefined);
    contents.getURL.mockReturnValue("https://workspace.example.test/");
    contents.executeJavaScript.mockResolvedValue(true);
    contents.isDestroyed.mockReturnValue(false);
    contents.debugger.sendCommand.mockResolvedValue(undefined);
    contents.debugger.isAttached.mockReturnValue(true);
  });
  afterEach(() => vi.useRealTimers());

  it("reads existing storage in a windowless, sandboxed view without running page scripts", async () => {
    expect(await defaultSessionHasOriginData("https://workspace.example.test")).toBe(true);
    expect(createView).toHaveBeenCalledWith({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        images: false,
      },
    });
    expect(contents.debugger.sendCommand).toHaveBeenCalledWith("Network.setBypassServiceWorker", {
      bypass: true,
    });
    expect(contents.debugger.sendCommand).toHaveBeenCalledWith("Fetch.enable", {
      patterns: [{ urlPattern: "*" }],
    });
    expect(contents.debugger.detach).toHaveBeenCalledOnce();
    expect(contents.close).toHaveBeenCalledOnce();
  });

  it("only selects a fresh partition after a confirmed empty result", async () => {
    contents.executeJavaScript.mockResolvedValue(false);
    expect(await defaultSessionHasOriginData("https://workspace.example.test")).toBe(false);
    contents.executeJavaScript.mockRejectedValue(new Error("Storage unavailable"));
    await expect(defaultSessionHasOriginData("https://workspace.example.test")).rejects.toThrow(
      "Storage unavailable",
    );
    expect(contents.close).toHaveBeenCalledTimes(2);
  });

  it("bounds stalled loads and disposes the renderer instead of hanging startup", async () => {
    vi.useFakeTimers();
    contents.loadURL.mockReturnValue(new Promise(() => {}));
    const result = defaultSessionHasOriginData("https://workspace.example.test", 100);
    const rejected = expect(result).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(contents.close).toHaveBeenCalledOnce();
    expect(contents.executeJavaScript).not.toHaveBeenCalled();
  });

  it("also bounds stalled storage reads", async () => {
    vi.useFakeTimers();
    contents.executeJavaScript.mockReturnValue(new Promise(() => {}));
    const result = defaultSessionHasOriginData("https://workspace.example.test", 100);
    const rejected = expect(result).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(contents.close).toHaveBeenCalledOnce();
  });

  it("does not mistake a redirect's storage for the requested origin", async () => {
    contents.getURL.mockReturnValue("https://another.example.test/login");
    await expect(defaultSessionHasOriginData("https://workspace.example.test")).rejects.toThrow(
      "redirected",
    );
    expect(contents.executeJavaScript).not.toHaveBeenCalled();
    expect(contents.close).toHaveBeenCalledOnce();
  });
});
