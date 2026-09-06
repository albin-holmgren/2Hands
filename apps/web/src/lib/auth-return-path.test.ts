import { describe, expect, it } from "vitest";
import { authReturnPath } from "./auth-return-path";

describe("account return destination", () => {
  it.each([
    "/app",
    "/app/bot-1?space=studio",
    "/app/g/group-1#message-2",
    "/onboarding",
    "/mcp/oauth/callback?state=offline-state&code=offline-code",
  ])("preserves %s", (returnTo) => {
    expect(authReturnPath({ returnTo })).toBe(returnTo);
  });
  it.each([
    undefined,
    null,
    {},
    { returnTo: 9 },
    { returnTo: "https://outside.test" },
    { returnTo: "//outside.test/app" },
    { returnTo: "/\\outside.test/app" },
    { returnTo: "/sign-in" },
    { returnTo: "/api/auth/sign-out" },
  ])("rejects unrelated or external destinations: %j", (state) => {
    expect(authReturnPath(state)).toBe("/app");
  });
});
