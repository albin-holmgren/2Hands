import { expect, test } from "@playwright/test";

for (const [route, title] of [
  ["/support/", "2hands support"],
  ["/privacy/", "Privacy"],
  ["/about/", "About 2hands"],
]) {
  test(`${route} has current product information`, async ({ page }, testInfo) => {
    await page.goto(route!);
    await expect(page.getByRole("heading", { name: title!, exact: true })).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "2hands home" })).toBeVisible();
    if (route !== "/about/") {
      await expect(page.getByText("Public registration is currently closed.")).toBeVisible();
    }
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await testInfo.attach(`${testInfo.project.name}-${route!.replaceAll("/", "")}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
}

test("pricing identifies preview availability and links to working setup instructions", async ({
  page,
}, testInfo) => {
  await page.goto("/#pricing");
  const pricing = page.locator("#pricing");
  await expect(
    pricing.getByText("Public registration is currently closed.", { exact: false }),
  ).toBeVisible();
  await expect(pricing.getByRole("link", { name: "Self-host", exact: true })).toHaveCount(4);
  for (const link of await pricing.getByRole("link", { name: "Self-host", exact: true }).all()) {
    await expect(link).toHaveAttribute("href", /\/2Hands\/blob\/main\/docs\/2hands-hosting\.md$/);
  }
  await testInfo.attach(`${testInfo.project.name}-pricing`, {
    body: await pricing.screenshot(),
    contentType: "image/png",
  });
});
