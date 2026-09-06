import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("packaged welcome opens privately, keeps its sandbox, and recovers a rejected sign-in", async () => {
  const executablePath = process.env.RAKAZO_ELECTRON_EXECUTABLE;
  test.skip(!executablePath, "Set the path to a locally packaged executable.");
  const userData = await mkdtemp(path.join(tmpdir(), "2hands-packaged-test-"));
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url?.startsWith("/api/auth/")) {
      response.setHeader("content-type", "application/json");
      if (request.url === "/api/auth/capabilities") {
        response.end(
          JSON.stringify({ passwordReset: false, resetUrl: null, signupsEnabled: true }),
        );
      } else if (request.url === "/api/auth/sign-in/email") {
        response.writeHead(401);
        response.end(
          JSON.stringify({
            code: "INVALID_EMAIL_OR_PASSWORD",
            message: "Invalid email or password",
          }),
        );
      } else response.end("null");
      return;
    }
    // The packaged renderer must come from Resources/web, not this placeholder.
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><main>Remote document placeholder</main>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture has no address");
  const started = performance.now();
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      executablePath,
      env: {
        ...process.env,
        RAKAZO_ELECTRON_E2E: "1",
        RAKAZO_ELECTRON_HIDDEN: "1",
        RAKAZO_PERFORMANCE_USER_DATA: userData,
        RAKAZO_WEB_URL: `http://127.0.0.1:${address.port}/`,
        RAKAZO_DISABLE_BUNDLED_RENDERER: "0",
      },
    });
    const page = await app.firstWindow();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    // Seeing the first paint is insufficient: failed readiness used to destroy
    // the Welcome window eight seconds later and reopen connection setup.
    await expect
      .poll(
        () => app!.evaluate(() => performance.getEntriesByName("rk:main:load-url-resolved").length),
        { timeout: 12_000 },
      )
      .toBe(1);
    const startupMs = Math.round(performance.now() - started);
    const processState = await app.evaluate(({ app, BrowserWindow }) => ({
      packaged: app.isPackaged,
      profile: app.getPath("userData"),
      windows: BrowserWindow.getAllWindows().map((window) => ({
        visible: window.isVisible(),
        nodeIntegration: window.webContents.getLastWebPreferences().nodeIntegration,
        contextIsolation: window.webContents.getLastWebPreferences().contextIsolation,
        sandbox: window.webContents.getLastWebPreferences().sandbox,
      })),
    }));
    expect(processState).toEqual({
      packaged: true,
      profile: userData,
      windows: [{ visible: false, nodeIntegration: false, contextIsolation: true, sandbox: true }],
    });
    expect(
      await page.evaluate(() => ({
        require: typeof (window as unknown as { require: unknown }).require,
        process: typeof (window as unknown as { process: unknown }).process,
      })),
    ).toEqual({ require: "undefined", process: "undefined" });
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in to 2hands" })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill("packaged@example.test");
    await page.getByLabel("Password", { exact: true }).fill("invalid-test-password");
    await page.getByRole("button", { name: "Continue with email", exact: true }).click();
    await expect(page.getByText("Invalid email or password", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with email", exact: true }),
    ).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath("packaged-auth.png") });
    expect(requests).toContain("/api/auth/sign-in/email");
    expect(requests.some((url) => url.startsWith("/assets/"))).toBe(false);
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
      ),
    ).toBe(true);
    const warm = await app.evaluate(async ({ app, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      const id = window.webContents.id;
      const began = performance.now();
      // macOS keeps the rendered workspace warm when the window is closed.
      // Activation must reuse it, without creating a setup/relaunch cycle.
      if (process.platform === "darwin") window.close();
      app.emit("activate");
      await new Promise((resolve) => setTimeout(resolve, 0));
      return {
        elapsedMs: performance.now() - began,
        sameRenderer: BrowserWindow.getAllWindows()[0]?.webContents.id === id,
        windows: BrowserWindow.getAllWindows().length,
        marks: performance
          .getEntriesByType("mark")
          .map(({ name, startTime }) => ({ name, startTime })),
      };
    });
    expect(warm.sameRenderer).toBe(true);
    expect(warm.windows).toBe(1);
    const performancePath = test.info().outputPath("desktop-performance.json");
    await writeFile(performancePath, JSON.stringify({ startupMs, warm }, null, 2));
    await test.info().attach("desktop-performance.json", {
      contentType: "application/json",
      path: performancePath,
    });
    test.info().annotations.push({ type: "packaged-startup-ms", description: String(startupMs) });
  } finally {
    await app?.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(userData, { recursive: true, force: true });
  }
});
