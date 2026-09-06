import { expect, type Page, test } from "@playwright/test";
import { PLAN_IDS, PLANS } from "@rakazo/core";

const hostingGuide = /\/2Hands\/blob\/main\/docs\/2hands-hosting\.md$/;

test.beforeEach(async ({ page, baseURL }) => {
  const localOrigin = new URL(baseURL!).origin;
  // The marketing preview is static. Never submit emails, invoke providers, or
  // depend on analytics and third-party fonts for deterministic screenshots.
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (
      new URL(request.url()).origin === localOrigin &&
      ["GET", "HEAD"].includes(request.method())
    ) {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
});

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

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
    await expectNoHorizontalOverflow(page);
    await testInfo.attach(`${testInfo.project.name}-${route!.replaceAll("/", "")}`, {
      body: await page.screenshot({ fullPage: true, animations: "disabled" }),
      contentType: "image/png",
    });
  });
}

test("homepage shows the product and working preview and self-host actions", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("You’ve got ideas.");
  await expect(page.locator("h1")).toContainText("We’ve got hands.");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("header").getByRole("link", { name: /Open app/ })).toHaveAttribute(
    "href",
    "https://app.2hands.ai/sign-in",
  );
  const explore = page.getByRole("link", { name: "Explore the workspace", exact: true });
  await expect(explore).toHaveAttribute("href", "#demo");
  const setup = page.getByRole("link", { name: "Self-host for free", exact: true });
  expect(await setup.count()).toBeGreaterThan(0);
  for (const link of await setup.all()) await expect(link).toHaveAttribute("href", hostingGuide);
  await expect(page.locator("form[data-waitlist-form], [data-get-started-dialog]")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await expectNoHorizontalOverflow(page);
  await testInfo.attach(`${testInfo.project.name}-homepage-hero`, {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  await testInfo.attach(`${testInfo.project.name}-homepage-full`, {
    body: await page.screenshot({ fullPage: true, animations: "disabled" }),
    contentType: "image/png",
  });
  await explore.click();
  await expect(page).toHaveURL(/#demo$/);
  await expect(page.locator("#demo")).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  expect(pageErrors).toEqual([]);
});

test("pricing identifies preview availability and links to working setup instructions", async ({
  page,
}, testInfo) => {
  await page.goto("/#pricing");
  const pricing = page.locator("#pricing");
  await expect(
    pricing.getByText("Public registration is currently closed.", { exact: false }),
  ).toBeVisible();
  for (const id of PLAN_IDS) {
    const plan = PLANS[id];
    const card = pricing.locator("article").filter({
      has: page.getByRole("heading", { name: plan.name, exact: true }),
    });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(`$${plan.priceUsd}`);
    await expect(card).toContainText(`$${plan.allowanceUsd} included`);
    await expect(card).toContainText("/ month");
  }
  const setup = pricing.getByRole("link", { name: "Self-host for free", exact: true });
  await expect(setup).toHaveCount(1);
  await expect(setup).toHaveAttribute("href", hostingGuide);
  await expectNoHorizontalOverflow(page);
  await testInfo.attach(`${testInfo.project.name}-pricing`, {
    body: await pricing.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  const usageDetails = pricing.locator("details");
  await usageDetails.locator("summary").click();
  await expect(usageDetails).toHaveJSProperty("open", true);
  await expect(usageDetails.locator("p")).toContainText("$0.15 per active hour");
  await expectNoHorizontalOverflow(page);
});

test("FAQ answers open and close with keyboard controls", async ({ page }, testInfo) => {
  await page.goto("/");
  const question = page.locator('section[aria-labelledby="faq-title"] details').first();
  const summary = question.locator("summary");
  await expect(summary).toBeVisible();
  await expect(question).toHaveJSProperty("open", false);
  await summary.focus();
  await expect(summary).toBeFocused();
  await summary.press("Enter");
  await expect(question).toHaveJSProperty("open", true);
  await expect(question.locator("p").first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await testInfo.attach(`${testInfo.project.name}-faq-open`, {
    body: await question.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  await summary.press("Space");
  await expect(question).toHaveJSProperty("open", false);
});

test("navigation reaches pricing and mobile menu closes on Escape and selection", async ({
  page,
  isMobile,
}, testInfo) => {
  await page.goto("/");
  if (isMobile) {
    const menu = page.locator("header details");
    const toggle = menu.locator("summary");
    await expect(toggle).toBeVisible();
    const target = await toggle.boundingBox();
    expect(target?.width).toBeGreaterThanOrEqual(44);
    expect(target?.height).toBeGreaterThanOrEqual(44);
    await toggle.click();
    await expect(menu).toHaveJSProperty("open", true);
    const pricing = menu.locator('a[href$="#pricing"]');
    await expect(pricing).toBeVisible();
    await testInfo.attach(`${testInfo.project.name}-navigation-open`, {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveJSProperty("open", false);
    await toggle.click();
    await pricing.click();
    await expect(menu).toHaveJSProperty("open", false);
  } else {
    await page.locator('header a[href$="#pricing"]:visible').click();
  }
  await expect(page).toHaveURL(/#pricing$/);
  await expect(page.locator("#pricing")).toBeInViewport();
  await expectNoHorizontalOverflow(page);
});

test("hero transfers a draft and model into the locally scoped workspace preview", async ({
  page,
  isMobile,
}, testInfo) => {
  const submittedRequests: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) submittedRequests.push(request.url());
  });
  await page.goto("/");
  const preview = page.getByTestId("workspace-preview");
  const selectCharacter = async (name: "Pip" | "Scout" | "Kit") => {
    if (isMobile) {
      const picker = preview.getByRole("button", { name: /^Assistant: / });
      const target = await picker.boundingBox();
      expect(target?.width).toBeGreaterThanOrEqual(44);
      expect(target?.height).toBeGreaterThanOrEqual(44);
      await picker.click();
      await preview
        .getByRole("listbox", { name: "Assistant", exact: true })
        .getByRole("option", { name, exact: true })
        .click();
      await expect(picker).toHaveAccessibleName(`Assistant: ${name}`);
    } else {
      const character = preview.getByRole("button", { name: new RegExp(`^${name}\\b`) });
      await character.click();
      await expect(character).toHaveAttribute("aria-pressed", "true");
    }
    const avatar = preview
      .locator(`img.landing-bot-avatar[src="/characters/${name.toLowerCase()}.svg"]:visible`)
      .first();
    await expect(avatar).toBeVisible();
    await expect
      .poll(() =>
        avatar.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
  };
  const brand = page.locator('header img[src="/brand/twohands-mark.svg"]');
  await expect(brand).toBeVisible();
  await expect
    .poll(() =>
      brand.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  expect(await preview.locator(".landing-bot-avatar:visible").count()).toBeGreaterThan(0);
  await expect(page.locator('img[src*="rakazo-mark"]')).toHaveCount(0);
  const draft = preview.getByRole("textbox", { name: "Try a prompt in the preview" });
  await expect(preview.getByText("Sample content. No tasks run or prompts sent.")).toBeVisible();
  const heroDraft = page.getByRole("textbox", { name: "Describe a task", exact: true });
  const openPreview = page.getByRole("button", { name: "Open workspace preview", exact: true });
  await expect(openPreview).toBeDisabled();
  await page.getByRole("button", { name: "Research an idea", exact: true }).click();
  await expect(heroDraft).toBeFocused();
  await expect(heroDraft).toHaveValue(/Research an idea/);
  await heroDraft.fill("A quiet weekend by the sea");
  await page.getByRole("combobox", { name: "Preview model", exact: true }).selectOption("GPT");
  await openPreview.click();
  await expect(draft).toHaveValue("A quiet weekend by the sea");
  await expect(draft).toBeFocused();
  await expect(preview).toBeInViewport();
  await expect(preview.getByRole("button", { name: "Model: GPT", exact: true })).toBeVisible();
  await testInfo.attach(`${testInfo.project.name}-hero-preview-transfer`, {
    body: await preview.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  await selectCharacter("Pip");

  const modelTrigger = preview.getByRole("button", { name: "Model: GPT", exact: true });
  await modelTrigger.focus();
  await modelTrigger.press("ArrowDown");
  const models = preview.getByRole("listbox", { name: "Model", exact: true });
  await expect(models.getByRole("option", { name: "GPT", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(models.getByRole("option", { name: "Claude", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(models.getByRole("option", { name: "Gemini", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(preview.getByRole("button", { name: "Model: Gemini", exact: true })).toBeFocused();
  await expect(models).toHaveCount(0);

  await preview.getByRole("button", { name: "Workspace: Personal", exact: true }).click();
  const spaces = preview.getByRole("listbox", { name: "Workspace", exact: true });
  await expect(spaces.getByRole("option", { name: "Personal", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await testInfo.attach(`${testInfo.project.name}-workspace-picker`, {
    body: await preview.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  await spaces.getByRole("option", { name: "Studio", exact: true }).click();
  await expect(draft).toHaveValue("");
  await expect(preview.getByRole("button", { name: "Model: Claude", exact: true })).toBeVisible();
  await draft.fill("A launch plan for our studio");

  await preview.getByRole("button", { name: "Workspace: Studio", exact: true }).click();
  await spaces.getByRole("option", { name: "Personal", exact: true }).click();
  await expect(draft).toHaveValue("A quiet weekend by the sea");
  const savedModel = preview.getByRole("button", { name: "Model: Gemini", exact: true });
  await savedModel.click();
  await expect(models.getByRole("option", { name: "Gemini", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await testInfo.attach(`${testInfo.project.name}-model-picker`, {
    body: await preview.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  await page.keyboard.press("Escape");
  await expect(models).toHaveCount(0);
  await expect(savedModel).toBeFocused();

  await selectCharacter("Scout");
  await expect(draft).toHaveValue("");
  await draft.fill("Compare two weekend routes");
  await preview.getByRole("button", { name: "Model: Claude", exact: true }).click();
  await models.getByRole("option", { name: "GPT", exact: true }).click();
  await selectCharacter("Kit");
  await expect(draft).toHaveValue("");
  await expect(preview.getByRole("button", { name: "Model: Claude", exact: true })).toBeVisible();
  await draft.fill("Build a tiny itinerary");
  await expectNoHorizontalOverflow(page);
  await testInfo.attach(`${testInfo.project.name}-preview-character-kit`, {
    body: await preview.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  await selectCharacter("Scout");
  await expect(draft).toHaveValue("Compare two weekend routes");
  await expect(preview.getByRole("button", { name: "Model: GPT", exact: true })).toBeVisible();
  await selectCharacter("Pip");
  await expect(draft).toHaveValue("A quiet weekend by the sea");
  await expect(savedModel).toBeVisible();

  await preview.getByRole("button", { name: "Show an example result", exact: true }).click();
  await expect(draft).toHaveValue("");
  await expect(preview.getByText("A quiet weekend by the sea", { exact: true })).toBeVisible();
  await expect(preview.getByRole("status")).toContainText("Example complete");
  await expect(preview.getByRole("status")).toContainText("Gemini · sample");
  await preview.getByRole("button", { name: "Open example files and activity" }).click();
  const panel = preview.getByRole("complementary", { name: "Example work panel" });
  await expect(panel.getByRole("heading", { name: "A slower weekend", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Activity", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(panel.getByText("Travel notes opened", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await testInfo.attach(`${testInfo.project.name}-preview-activity`, {
    body: await preview.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  const returnToChat = panel.getByRole("button", { name: "Return to conversation" });
  if (await returnToChat.isVisible()) {
    if (isMobile) {
      const target = await returnToChat.boundingBox();
      expect(target?.width).toBeGreaterThanOrEqual(44);
      expect(target?.height).toBeGreaterThanOrEqual(44);
    }
    await returnToChat.click();
    await expect(draft).toBeVisible();
  }
  expect(submittedRequests).toEqual([]);
});
