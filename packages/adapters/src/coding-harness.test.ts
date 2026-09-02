import { describe, expect, it } from "vitest";
import { runCodingHarness } from "./coding-harness.js";

describe("runCodingHarness", () => {
  it("requires a prompt", async () => {
    const result = await runCodingHarness({ harness: "codex", prompt: "  " }, {});
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/prompt/i);
  });

  it("fails closed when no Cursor key is configured", async () => {
    const result = await runCodingHarness(
      { harness: "cursor", prompt: "Add a health endpoint" },
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/CURSOR_API_KEY/);
  });
});
