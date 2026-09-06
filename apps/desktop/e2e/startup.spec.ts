import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("startup activation and legacy storage inspection do not open or close temporary windows", async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "2hands-startup-test-"));
  let releaseHealth: (() => void) | undefined;
  let documents = 0;
  const server = createServer((request, response) => {
    if (request.url === "/rpc/health") {
      releaseHealth = () => {
        if (response.writableEnded) return;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ json: { ok: true, version: "test" } }));
      };
      return;
    }
    if (request.url === "/") documents += 1;
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><main data-rakazo-route-ready="true">Willkommen</main>
      <div data-rakazo-app-state="ready"></div>
      <script>localStorage.setItem('page-ran', 'yes')</script>`);
  });
  const stalled = createServer(() => {});
  await Promise.all(
    [server, stalled].map(
      (value) => new Promise<void>((resolve) => value.listen(0, "127.0.0.1", resolve)),
    ),
  );
  const address = server.address();
  const stalledAddress = stalled.address();
  if (
    !address ||
    typeof address === "string" ||
    !stalledAddress ||
    typeof stalledAddress === "string"
  )
    throw new Error("Fixture address unavailable");
  const origin = `http://127.0.0.1:${address.port}`;
  const stalledOrigin = `http://127.0.0.1:${stalledAddress.port}`;
  // Simulate a pre-partition profile without copying any real user storage.
  await mkdir(path.join(profile, "session", "Local Storage"), { recursive: true });
  await writeFile(
    path.join(profile, "setup.json"),
    JSON.stringify({ mode: "existing", serverUrl: origin }),
  );
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    const env = {
      ...process.env,
      RAKAZO_ELECTRON_E2E: "1",
      RAKAZO_ELECTRON_HIDDEN: "1",
      RAKAZO_PERFORMANCE_USER_DATA: profile,
    };
    delete env.RAKAZO_WEB_URL;
    app = await electron.launch({ args: ["."], cwd: path.resolve(import.meta.dirname, ".."), env });
    await expect.poll(() => Boolean(releaseHealth)).toBe(true);
    const premature = await app.evaluate(({ app, BrowserWindow }) => {
      app.emit("activate");
      return BrowserWindow.getAllWindows().length;
    });
    expect(premature).toBe(0);
    releaseHealth!();
    await expect
      .poll(() =>
        app!.evaluate(() => performance.getEntriesByName("rk:main:load-url-resolved").length),
      )
      .toBe(1);
    const [page] = app.windows().filter((window) => !window.isClosed());
    await expect(page!.getByText("Willkommen", { exact: true })).toBeVisible();
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((window) => window.isVisible()),
      ),
    ).toEqual([false]);

    const beforeProbes = documents;
    const inspected = await app.evaluate(
      async ({ app, WebContentsView, session }, { origin, stalledOrigin }) => {
        const { defaultSessionHasOriginData } = process
          .getBuiltinModule("module")
          .createRequire(`${app.getAppPath()}/package.json`)("./dist/session-storage.js");
        let created = 0;
        let closed = 0;
        const onCreate = () => {
          created += 1;
        };
        const onClose = () => {
          closed += 1;
        };
        app.on("browser-window-created", onCreate);
        app.on("window-all-closed", onClose);
        try {
          const empty = await defaultSessionHasOriginData(origin);
          const seed = new WebContentsView({
            webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
          });
          try {
            await seed.webContents.loadURL(origin);
            await seed.webContents.executeJavaScript(
              "localStorage.clear(); localStorage.setItem('preserved', 'synthetic')",
            );
            session.defaultSession.flushStorageData();
          } finally {
            seed.webContents.close();
          }
          const populated = await defaultSessionHasOriginData(origin);
          const began = performance.now();
          const unreachableEmpty = await defaultSessionHasOriginData(stalledOrigin);
          return {
            empty,
            populated,
            unreachableEmpty,
            elapsed: performance.now() - began,
            created,
            closed,
          };
        } finally {
          app.removeListener("browser-window-created", onCreate);
          app.removeListener("window-all-closed", onClose);
        }
      },
      { origin, stalledOrigin },
    );
    expect(inspected).toMatchObject({
      empty: false,
      populated: true,
      unreachableEmpty: false,
      created: 0,
      closed: 0,
    });
    expect(inspected.elapsed).toBeLessThan(2_000);
    // Only the deliberate seed page reaches HTTP; all migration reads are local.
    expect(documents - beforeProbes).toBe(1);
  } finally {
    releaseHealth?.();
    await app?.close();
    await Promise.all(
      [server, stalled].map((value) => {
        value.closeAllConnections();
        return new Promise<void>((resolve, reject) =>
          value.close((error) => (error ? reject(error) : resolve())),
        );
      }),
    );
    await rm(profile, { recursive: true, force: true });
  }
});

test("a stalled renderer navigation falls back to setup after a bounded load", async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "2hands-stalled-startup-test-"));
  let documents = 0;
  const server = createServer((_request, response) => {
    documents += 1;
    // The lightweight document probe succeeds; the actual navigation stalls.
    if (documents === 1) response.end("<!doctype html><main>Available</main>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture address unavailable");
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      args: ["."],
      cwd: path.resolve(import.meta.dirname, ".."),
      env: {
        ...process.env,
        RAKAZO_ELECTRON_E2E: "1",
        RAKAZO_ELECTRON_HIDDEN: "1",
        RAKAZO_PERFORMANCE_USER_DATA: profile,
        RAKAZO_WEB_URL: `http://127.0.0.1:${address.port}`,
      },
    });
    await app.firstWindow();
    await expect
      .poll(
        () =>
          app!.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().some((window) =>
              window.webContents.getURL().endsWith("setup.html"),
            ),
          ),
        { timeout: 12_000 },
      )
      .toBe(true);
    const [setup] = app.windows();
    await expect(setup!.locator("#status")).toContainText("Timed out waiting for the server");
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
      ),
    ).toBe(true);
  } finally {
    await app?.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(profile, { recursive: true, force: true });
  }
});
