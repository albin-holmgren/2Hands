import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const routerRequire = createRequire(require.resolve("expo-router/package.json"));
const queryStringPath = routerRequire.resolve("query-string");
const queryRequire = createRequire(queryStringPath);
const decode = queryRequire("decode-uri-component") as (input: string) => string;

describe("Expo Router's patched URI decoder", () => {
  it.each([
    ["hello+world", "hello world"],
    ["%E2%82%AC", "€"],
    ["%F0%9F%98%80", "😀"],
    ["bad%GG%41", "bad%GGA"],
    ["%FE%FF", "��"],
    ["%C2", "�"],
    ["%C0%AF%41", "%C0%AFA"],
    ["%E2%82", "%E2%82"],
  ])("preserves the CommonJS 0.2.x contract for %s", (encoded, expected) => {
    expect(decode(encoded)).toBe(expected);
  });

  it("decodes long malformed query strings through Expo's actual dependency without recursion", () => {
    // A child deadline prevents a missing patch from hanging the entire test worker.
    // Assert deterministic decoded output; the deadline only bounds failed execution.
    const result = execFileSync(
      process.execPath,
      [
        "-e",
        `const queryString = require(process.argv[1]);
const malformed = "%C0%AF".repeat(20_000);
const query = "payload=" + malformed + "%41&title=hello+world&symbol=%E2%82%AC";
const parsed = queryString.parse(query);
process.stdout.write(JSON.stringify({
  intact: parsed.payload === malformed + "A",
  title: parsed.title,
  symbol: parsed.symbol
}));`,
        queryStringPath,
      ],
      { encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(JSON.parse(result)).toEqual({ intact: true, title: "hello world", symbol: "€" });
  });
});
