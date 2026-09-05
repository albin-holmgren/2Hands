import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

test("workspace navigation is explicit and chat creation requires approval", async ({
  page,
}, testInfo) => {
  const stamp = Date.now();
  await signup(page, `spaces-${stamp}@rakazo.test`, "password12", "Space Owner");
  await completeOnboarding(page);

  const sidebar = page.locator("aside").first();
  await expect(page.getByTestId("workspace-switcher")).toContainText("Personal");
  await expect(sidebar.getByRole("button", { name: /^Chief/ })).toHaveCount(1);
  await captureScreenshot(page, testInfo, "single-space-sidebar");

  await page.getByTitle("Create", { exact: true }).click();
  await page.getByRole("button", { name: "New space" }).click();
  const dialog = page.getByRole("dialog", { name: "New space" });
  await expect(dialog.getByLabel("Name")).toBeVisible();
  await dialog.getByLabel("Name").fill("Customer support");
  await captureScreenshot(page, testInfo, "new-space-dialog");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  const composer = page.getByRole("combobox", { name: "Message Chief" });
  await composer.fill("Create a space named Customer support");
  await composer.press("Enter");
  await expect(page.getByRole("button", { name: "Create space", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Always allow this tool" })).toHaveCount(0);
  await expect(sidebar.getByText("Customer support", { exact: true })).toHaveCount(0);
  await captureScreenshot(page, testInfo, "create-space-chat-approval");
  await page.getByRole("button", { name: "Create space", exact: true }).click();
  await expect(page.getByText("Created", { exact: true })).toBeVisible();

  await page.getByTestId("workspace-switcher").click();
  const workspaces = page.getByRole("dialog", { name: "Workspaces" });
  await expect(
    workspaces.getByRole("button", { name: "Customer support", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await captureScreenshot(page, testInfo, "spaces-switcher");
  await workspaces.getByRole("button", { name: "Customer support", exact: true }).click();
  await page.waitForURL(/\/app/);
  await completeOnboarding(page);
  await expect(page.getByTestId("workspace-switcher")).toContainText("Customer support");
  await expect(sidebar.getByRole("button", { name: /^Chief/ })).toHaveCount(1);
  await captureScreenshot(page, testInfo, "selected-workspace-sidebar");
  await page.getByTestId("workspace-switcher").click();
  await workspaces.getByRole("button", { name: /^Personal/ }).click();
  await expect(page.getByTestId("workspace-switcher")).toContainText("Personal");
  await expect(sidebar.getByRole("button", { name: /^Chief/ })).toHaveCount(1);
});
