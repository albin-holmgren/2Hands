import { expect, type Page, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

const session = {
  user: {
    id: "offline-auth-user",
    name: "Alex",
    email: "alex@example.test",
    emailVerified: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  session: {
    id: "offline-session",
    token: "offline-session-token",
    userId: "offline-auth-user",
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
};

async function anonymous(page: Page) {
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: null }));
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill({
      json: {
        signupsEnabled: true,
        passwordReset: true,
        resetUrl: "http://127.0.0.1:5193/reset-password",
      },
    }),
  );
}

test("registration lock is consistent on welcome, sign-in and direct registration", async ({
  page,
}, testInfo) => {
  await anonymous(page);
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill({ json: { signupsEnabled: false, passwordReset: false, resetUrl: null } }),
  );
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start free" })).toHaveCount(0);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("link", { name: "Sign up", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue with email" })).toBeEnabled();
  await page.goto("/sign-up");
  await expect(page.getByText("Registration is currently unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
  await captureScreenshot(page, testInfo, "auth-registration-unavailable");
});

test("registration retries a failed capability read without blocking sign-in", async ({
  page,
}, testInfo) => {
  await anonymous(page);
  let unavailable = true;
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill(
      unavailable
        ? { status: 503, json: { error: "Unavailable" } }
        : { json: { signupsEnabled: true, passwordReset: false, resetUrl: null } },
    ),
  );
  await page.goto("/sign-up");
  await expect(page.getByRole("alert")).toHaveText("Could not load account options.");
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("minlength", "8");
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, testInfo, "auth-create-account-mobile");
});

test("invalid and expired reset links give a working recovery path", async ({ page }, testInfo) => {
  await anonymous(page);
  await page.goto("/reset-password?error=INVALID_TOKEN&token=stale");
  await expect(page.getByRole("alert")).toContainText("invalid or expired");
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Request a new link" }).click();
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  await page.route("**/api/auth/reset-password", (route) =>
    route.fulfill({ status: 400, json: { code: "INVALID_TOKEN", message: "Invalid token" } }),
  );
  await page.goto("/reset-password?token=expired-example");
  await page.getByLabel("New password", { exact: true }).fill("password-example-1");
  await page.getByLabel("Confirm password", { exact: true }).fill("password-example-2");
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Passwords do not match");
  await page.getByLabel("Confirm password", { exact: true }).fill("password-example-1");
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  await captureScreenshot(page, testInfo, "auth-expired-reset");
});

test("unconfigured recovery stays explicit and social sign-in is not advertised", async ({
  page,
}, testInfo) => {
  await anonymous(page);
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill({ json: { signupsEnabled: true, passwordReset: false, resetUrl: null } }),
  );
  await page.goto("/forgot-password");
  await expect(page.getByText("Password recovery is not available on this server.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page.getByRole("button", { name: /Google|Apple|GitHub/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveCount(0);
  await captureScreenshot(page, testInfo, "auth-email-sign-in");
});

test("normal sign-in restores the requested workspace and accepts existing passwords", async ({
  page,
}) => {
  await anonymous(page);
  let authenticated = false;
  await page.route("**/api/auth/get-session*", (route) =>
    route.fulfill({ json: authenticated ? session : null }),
  );
  await page.route("**/api/auth/sign-in/email", (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      email: "alex@example.test",
      password: "old1234",
    });
    authenticated = true;
    return route.fulfill({
      json: { token: "offline-session-token", user: session.user, redirect: false },
    });
  });
  await page.route("**/rpc/**", (route) =>
    route.fulfill({ status: 503, json: { error: { message: "Workspace unavailable" } } }),
  );
  await page.goto("/app/second-bot?space=studio");
  await expect(page.getByRole("heading", { name: "Sign in to 2hands" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("alex@example.test");
  await page.getByLabel("Password", { exact: true }).fill("old1234");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page).toHaveURL(/\/app\/second-bot\?space=studio$/);
});

test("confirmed session expiry returns to sign-in instead of leaving an unusable workspace", async ({
  page,
}) => {
  let authenticated = true;
  await anonymous(page);
  await page.route("**/api/auth/get-session*", (route) =>
    route.fulfill(
      authenticated ? { json: session } : { status: 401, json: { message: "Unauthorized" } },
    ),
  );
  await page.route("**/rpc/**", (route) => {
    authenticated = false;
    return route.fulfill({ status: 401, json: { code: "UNAUTHORIZED", message: "Unauthorized" } });
  });
  await page.goto("/app/second-bot?space=studio");
  await expect(page.getByRole("heading", { name: "Sign in to 2hands" })).toBeVisible();
});

test("onboarding retries initialization without falling into a false create-bot step", async ({
  page,
}, testInfo) => {
  await anonymous(page);
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: session }));
  let failed = true;
  await page.route("**/rpc/**", (route) => {
    if (failed) return route.fulfill({ status: 503, json: { error: { message: "Unavailable" } } });
    return route.fulfill({
      json: {
        json: route.request().url().endsWith("/me")
          ? { needsModel: true, defaultProvider: null, defaultModel: null }
          : [],
      },
    });
  });
  await page.goto("/onboarding");
  await expect(page.getByRole("alert")).toHaveText("Could not open your workspace.");
  await expect(page.getByRole("heading", { name: "Create your first bot" })).toHaveCount(0);
  await captureScreenshot(page, testInfo, "auth-onboarding-retry");
  failed = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Connect a model" })).toBeVisible();
});
