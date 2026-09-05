import { describe, expect, it, vi } from "vitest";
import { blockedAuthPaths, createAuth, passwordResetEmail, resolveSignupPolicy } from "./index.js";

describe("auth policy", () => {
  it("rejects real signup requests while the deployment lock is active", async () => {
    const findUnique = vi.fn().mockRejectedValue(new Error("saved policy must not bypass lock"));
    const auth = createAuth({ deploymentSettings: { findUnique } } as never, {
      secret: "deterministic-test-auth-secret-with-more-than-32-characters",
      baseURL: "http://localhost:3100",
      webOrigin: "http://localhost:3100",
      signupsEnabled: "true",
      signupsLocked: "true",
      signupAllowlist: undefined,
    });
    const response = await auth.handler(
      new Request("http://localhost:3100/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "locked@example.test",
          password: "password123",
          name: "Locked",
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Registration is closed");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("blocks invitation and org-creation paths in version 1", () => {
    expect(blockedAuthPaths.some((path) => path.includes("invite"))).toBe(true);
    expect(blockedAuthPaths.some((path) => path.includes("create"))).toBe(true);
  });
});

describe("passwordResetEmail", () => {
  it("keeps the reset URL in text and escapes user-controlled HTML", () => {
    const message = passwordResetEmail(
      { id: "user-1", email: "ada@example.test", name: '<Ada & "team">' },
      "https://rakazo.test/reset-password?token=secret&next=1",
    );

    expect(message).toMatchObject({
      to: "ada@example.test",
      subject: "Reset your 2hands password",
    });
    expect(message.text).toContain("https://rakazo.test/reset-password?token=secret&next=1");
    expect(message.html).toContain("&lt;Ada &amp; &quot;team&quot;&gt;");
    expect(message.html).toContain("token=secret&amp;next=1");
    expect(message.html).not.toContain('<Ada & "team">');
  });
});

describe("resolveSignupPolicy", () => {
  it.each(["true", "1"])(
    "honors the deployment lock %s before reading saved settings",
    async (locked) => {
      const findUnique = vi.fn().mockResolvedValue({
        signupsEnabled: true,
        signupAllowlist: "",
        signupPolicyInitialized: true,
      });
      await expect(
        resolveSignupPolicy({ deploymentSettings: { findUnique } } as never, {
          signupsEnabled: "true",
          signupsLocked: locked,
          signupAllowlist: undefined,
        }),
      ).resolves.toEqual({ enabled: false, allowlist: [] });
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it("restores the saved policy when the deployment lock is removed", async () => {
    const prisma = {
      deploymentSettings: {
        findUnique: vi.fn().mockResolvedValue({
          signupsEnabled: true,
          signupAllowlist: "approved@example.com",
          signupPolicyInitialized: true,
        }),
      },
    };
    await expect(
      resolveSignupPolicy(prisma as never, {
        signupsEnabled: "false",
        signupsLocked: "false",
        signupAllowlist: undefined,
      }),
    ).resolves.toEqual({ enabled: true, allowlist: ["approved@example.com"] });
  });

  it("uses environment defaults before deployment settings exist", async () => {
    const prisma = {
      deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    await expect(
      resolveSignupPolicy(prisma as never, {
        signupsEnabled: "false",
        signupAllowlist: "you@example.com,@company.test",
      }),
    ).resolves.toEqual({
      enabled: false,
      allowlist: ["you@example.com", "@company.test"],
    });
  });

  it("keeps using the environment policy for a pre-upgrade uninitialized row", async () => {
    const prisma = {
      deploymentSettings: {
        findUnique: vi.fn().mockResolvedValue({
          signupsEnabled: true,
          signupAllowlist: "",
          signupPolicyInitialized: false,
        }),
      },
    };
    await expect(
      resolveSignupPolicy(prisma as never, {
        signupsEnabled: "false",
        signupAllowlist: "existing-policy@example.com",
      }),
    ).resolves.toEqual({ enabled: false, allowlist: ["existing-policy@example.com"] });
  });

  it("uses live deployment settings as the effective policy after initial seeding", async () => {
    const prisma = {
      deploymentSettings: {
        findUnique: vi.fn().mockResolvedValue({
          signupsEnabled: false,
          signupAllowlist: "approved@example.com",
          signupPolicyInitialized: true,
        }),
      },
    };
    await expect(
      resolveSignupPolicy(prisma as never, {
        signupsEnabled: "false",
        signupAllowlist: "environment-only@example.com",
      }),
    ).resolves.toEqual({ enabled: false, allowlist: ["approved@example.com"] });
  });
});
