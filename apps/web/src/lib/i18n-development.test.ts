import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("compiles every translation catalog through the development server", () => {
  // Use Node's real module loader: production builds and Vitest's transformed
  // imports do not exercise Lingui's development formatter interop.
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { createServer } from "vite";
const server = await createServer({
  logLevel: "silent",
  server: { middlewareMode: true, watch: null, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const counts = {};
  for (const locale of ["en", "de", "ko", "tr", "hi", "pt-BR", "zh-CN"]) {
    const result = await server.transformRequest("/src/locales/" + locale + "/messages.po");
    if (!result) throw new Error("Missing compiled catalog: " + locale);
    const { messages } = await import("data:text/javascript;base64," + Buffer.from(result.code).toString("base64"));
    counts[locale] = Object.keys(messages).length;
  }
  process.stdout.write(JSON.stringify(counts));
} finally {
  await server.close();
}`,
    ],
    {
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      env: {
        ...process.env,
        RAKAZO_IGNORE_ENV_FILES: "1",
        SCREEN_PROXY_SECRET: "offline-catalog-transform-test-secret",
      },
      encoding: "utf8",
      timeout: 20_000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const counts = JSON.parse(output) as Record<string, number>;
  expect(Object.keys(counts)).toEqual(["en", "de", "ko", "tr", "hi", "pt-BR", "zh-CN"]);
  for (const count of Object.values(counts)) expect(count).toBeGreaterThan(0);
});
