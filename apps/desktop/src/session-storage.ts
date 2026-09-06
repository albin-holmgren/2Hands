import { WebContentsView } from "electron";

/**
 * Read legacy origin storage without creating a window or running the app twice.
 * A BrowserWindow here can close the last window before startup creates main,
 * which quits the application on Windows/Linux. A target-scoped DevTools
 * interception supplies an empty document at the origin, so neither network
 * traffic nor application/service-worker scripts can create misleading storage.
 */
export async function defaultSessionHasOriginData(origin: string, timeoutMs = 8_000) {
  const probe = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      images: false,
    },
  });
  const contents = probe.webContents;
  let timer: NodeJS.Timeout | undefined;
  const intercept = (_event: Electron.Event, method: string, params: { requestId: string }) => {
    if (method !== "Fetch.requestPaused") return;
    void contents.debugger
      .sendCommand("Fetch.fulfillRequest", {
        requestId: params.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: "Content-Type", value: "text/html; charset=utf-8" },
          { name: "Content-Security-Policy", value: "default-src 'none'" },
        ],
        body: Buffer.from("<!doctype html><title>Storage check</title>").toString("base64"),
      })
      .catch(() => {
        if (!contents.isDestroyed()) contents.stop();
      });
  };
  try {
    return await Promise.race([
      (async () => {
        // A windowless WebContents has no renderer until its first navigation;
        // initialize locally before issuing renderer-side DevTools commands.
        await contents.loadURL("about:blank");
        contents.debugger.attach("1.3");
        contents.debugger.on("message", intercept);
        await contents.debugger.sendCommand("Network.setBypassServiceWorker", { bypass: true });
        await contents.debugger.sendCommand("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
        await contents.loadURL(origin);
        // A redirect would inspect another origin and choose the wrong session.
        if (new URL(contents.getURL()).origin !== origin) {
          throw new Error("The storage check was redirected to another server.");
        }
        return (await contents.executeJavaScript(`(async () => {
          if (localStorage.length > 0) return true;
          if (typeof indexedDB !== "undefined" && indexedDB.databases) {
            if ((await indexedDB.databases()).length > 0) return true;
          }
          if (typeof caches !== "undefined" && (await caches.keys()).length > 0) return true;
          return false;
        })()`)) as boolean;
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new DOMException("The storage check timed out.", "TimeoutError")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (!contents.isDestroyed()) {
      contents.debugger.removeListener("message", intercept);
      if (contents.debugger.isAttached()) contents.debugger.detach();
      contents.close();
    }
  }
}
