import { expect, type Page, test } from "@playwright/test";
import type {
  BillingPlanChangeStatus,
  Bot,
  ComputerStatus,
  Me,
  ModelCatalogEntry,
  ThreadSnapshot,
} from "@rakazo/contracts";
import { captureScreenshot } from "./helpers";

const now = "2026-09-04T12:00:00.000Z";
function bot(id: string, spaceId: string, name: string): Bot {
  return {
    id,
    spaceId,
    name,
    title: "Research and everyday work",
    description: "",
    instructions: "",
    color: "#3EC5A8",
    notifyOnFinish: false,
    pinned: false,
    sectionId: null,
    archivedAt: null,
    unread: false,
    parentBotId: null,
    memoryScope: null,
    threadId: `thread-${id}`,
    preview: "Your next idea starts here",
    status: "idle",
    computerMode: "team",
    updatedAt: now,
    createdAt: now,
    voiceId: null,
    autoSpeak: false,
    modelProvider: null,
    modelId: null,
    thinkingLevel: null,
    codingHarness: "codex",
    webhookConfigured: false,
  };
}
async function fixture(
  page: Page,
  {
    exhausted = false,
    theme = "dark",
    failed = false,
    legacy = false,
    paid = false,
    pastDue = false,
    computerAvailable = false,
    computer,
    deploymentOwner = false,
  }: {
    exhausted?: boolean;
    theme?: "light" | "dark";
    failed?: boolean;
    legacy?: boolean;
    paid?: boolean;
    pastDue?: boolean;
    computerAvailable?: boolean;
    computer?: ComputerStatus;
    deploymentOwner?: boolean;
  } = {},
) {
  const bots = [bot("chief", "personal", "Chief"), bot("research", "studio", "Research")];
  const requests: Array<{ path: string; space: string }> = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((value) => {
    localStorage.setItem("rakazo.ui-theme", value);
    localStorage.setItem("rakazo:space-id", "personal");
  }, theme);
  await page.route("**/api/auth/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("get-session")
        ? {
            user: {
              id: "fixture-user",
              name: "Alex",
              email: "alex@example.test",
              emailVerified: true,
              createdAt: now,
              updatedAt: now,
            },
            session: {
              id: "fixture-session",
              userId: "fixture-user",
              token: "offline-fixture",
              expiresAt: "2099-01-01T00:00:00Z",
              createdAt: now,
              updatedAt: now,
            },
          }
        : { passwordReset: false },
    }),
  );
  let resolveStarted: (() => void) | undefined;
  const controls = {
    requests,
    errors,
    delayNextPersonalRead() {
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        resolveStarted = resolve;
      });
      return { gate, started, release };
    },
  };
  let delayedGate: Promise<void> | null = null;
  const originalDelay = controls.delayNextPersonalRead;
  controls.delayNextPersonalRead = () => {
    const value = originalDelay();
    delayedGate = value.gate;
    return value;
  };
  await page.route("**/rpc/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/rpc/", "");
    const space = request.headers()["x-rakazo-space-id"] ?? "personal";
    requests.push({ path, space });
    let input: Record<string, unknown> = {};
    try {
      input = request.postDataJSON()?.json ?? {};
    } catch {
      /* no input */
    }
    const currentBot =
      bots.find((item) => item.id === input.botId) ?? bots.find((item) => item.spaceId === space)!;
    const spaces = [
      { id: "personal", name: "Personal", isDefault: true },
      { id: "studio", name: "Studio", isDefault: false },
      { id: "empty", name: "New project", isDefault: false },
    ].map((item) => ({
      ...item,
      bots: bots.filter((row) => row.spaceId === item.id),
      groups: [],
      botSections: [],
    }));
    const me: Me = {
      userId: "fixture-user",
      email: "alex@example.test",
      name: "Alex",
      spaceId: space,
      isDeploymentOwner: deploymentOwner,
      needsModel: false,
      defaultProvider: "fixture",
      defaultModel: "swift",
      computerHost: null,
      canChooseHostComputer: false,
      sandboxProvider: computerAvailable ? "e2b" : "none",
      avatarStyle: "organic",
    };
    function snapshot(): ThreadSnapshot {
      return {
        botId: currentBot.id,
        threadId: currentBot.threadId,
        cursor: 2,
        olderCursor: null,
        computer,
        messages: [
          {
            id: `user-${currentBot.id}`,
            threadId: currentBot.threadId,
            seq: 1,
            role: "user",
            blocks: [
              {
                kind: "text",
                text:
                  space === "personal"
                    ? "Help me plan a thoughtful product launch."
                    : "Summarize this week's research.",
              },
            ],
            createdAt: now,
          },
          {
            id: `reply-${currentBot.id}`,
            threadId: currentBot.threadId,
            seq: 2,
            role: "bot",
            botId: currentBot.id,
            blocks: [
              {
                kind: "text",
                text:
                  space === "personal"
                    ? "Let's start with the people you want to reach. I can put together a launch brief, compare channels, and turn the next steps into a clear checklist."
                    : "Your research workspace is ready. Share the material you want to explore, and we'll build on it together.",
              },
            ],
            createdAt: now,
          },
        ],
        run:
          currentBot.id === "chief"
            ? {
                id: "run-chief",
                botId: "chief",
                threadId: "thread-chief",
                taskId: "task-chief",
                status: failed ? "failed" : "running",
                trigger: "user",
                routineId: null,
                modelProvider: "fixture",
                modelId: "swift",
                error: failed ? "The model could not complete this task. Try again." : null,
                startedAt: now,
                completedAt: failed ? now : null,
                createdAt: now,
              }
            : null,
      };
    }
    let result: unknown = [];
    if (path === "bootstrap")
      result = {
        me,
        bots: bots.filter((item) => item.spaceId === space),
        groups: [],
        botSections: [],
        archivedBots: [],
        archivedGroups: [],
        thread: currentBot ? snapshot() : null,
        routines: [],
        spaces,
      };
    else if (path === "me") result = me;
    else if (path === "spaces/list")
      result = {
        current: {
          id: space,
          name: space === "personal" ? "Personal" : "Studio",
          bots: bots.filter((item) => item.spaceId === space),
          groups: [],
          botSections: [],
        },
        spaces,
      };
    else if (path === "onboarding/ensureChiefOfStaff") {
      const next = bot("project-chief", space, "Chief");
      next.title = next.name;
      bots.push(next);
      result = next;
    } else if (path === "threads/get") {
      const value = currentBot ? snapshot() : null;
      if (space === "personal" && delayedGate) {
        const gate = delayedGate;
        delayedGate = null;
        resolveStarted?.();
        await gate;
      }
      result = value;
    } else if (path === "threads/head") result = { threadId: currentBot.threadId, cursor: 2 };
    else if (path === "threads/subscribe") {
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
      return;
    } else if (path === "models/list")
      result = [
        {
          provider: "fixture",
          providerName: "Included models",
          id: "swift",
          label: "Swift",
          platform: true,
          inputUsdPerMillion: 0.2,
          outputUsdPerMillion: 0.8,
        },
        {
          provider: "fixture",
          providerName: "Included models",
          id: "reasoning",
          label: "Reasoning",
          platform: true,
          thinkingLevels: ["low", "high"],
          inputUsdPerMillion: 2,
          outputUsdPerMillion: 8,
        },
      ] as Partial<ModelCatalogEntry>[];
    else if (path === "bots/update") {
      Object.assign(currentBot, input);
      result = currentBot;
    } else if (path === "computer/screenUrl") result = { url: null };
    else if (path === "messaging/status") result = { enabled: false };
    else if (path === "voice/status") result = { ready: false, transcribe: false };
    else if (path === "memory/providerConfig") result = null;
    else if (path === "usage/summary") result = { runs: 4, inputTokens: 8000, outputTokens: 3000 };
    else if (path === "billing/get")
      result = {
        plan: legacy || paid ? "plus" : "free",
        planName: legacy || paid ? "Plus" : "Free",
        priceUsd: legacy || paid ? 20 : 0,
        status: pastDue ? "past_due" : "active",
        currentPeriodEnd: "2026-10-01T00:00:00Z",
        maxBots: 3,
        maxPlugins: 2,
        harnesses: [],
        modelTiers: [],
        monthlyTokens: 100000,
        tokensUsed: 11000,
        computerHours: 0,
        computerSecondsUsed: 0,
        checkoutEnabled: true,
        billingEnabled: true,
        allowanceUsd: paid ? 10 : 1,
        spentUsd: exhausted ? 1 : 0.3,
        reservedUsd: exhausted ? 0 : 0.04,
        remainingUsd: exhausted ? 0 : paid ? 9.66 : 0.66,
        resetAt: "2026-10-01T00:00:00Z",
        exhausted,
        ...(legacy ? { legacyUntil: "2026-10-01T00:00:00Z" } : {}),
      };
    else if (path === "billing/planChangeStatus")
      result = {
        currentPlan: legacy || paid ? "plus" : "free",
        currentPeriodEnd: legacy || paid ? "2026-10-01T00:00:00.000Z" : null,
        cancelAtPeriodEnd: false,
        pendingChange: null,
        canChange: true,
        canManageCancellation: legacy || paid,
        unavailableReason: null,
      } satisfies BillingPlanChangeStatus;
    else if (path.startsWith("threads/mark")) result = { ok: true };
    await route.fulfill({ json: { json: result } }).catch(() => undefined);
  });
  return controls;
}

test("unavailable computers keep chat usable and show setup only to the server owner", async ({
  page,
}, testInfo) => {
  const control = await fixture(page);
  await page.goto("/app/chief?space=personal");
  await page.getByRole("button", { name: "Agent computer" }).click();
  const hint = page.getByTestId("computers-unavailable-hint");
  await expect(hint).toContainText(
    "Computers are not available on this server. You can continue chatting.",
  );
  await expect(hint.getByText("Server setup", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("computer-preview-open")).toHaveCount(0);
  expect(control.requests.filter((request) => request.path === "computer/boot")).toHaveLength(0);
  await captureScreenshot(page, testInfo, "computers-unavailable-customer");
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("combobox", { name: "Message Chief" }).fill("Keep working on my draft");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
});

test("computer launch failures stay visible with a retry control", async ({ page }, testInfo) => {
  await fixture(page, { computerAvailable: true });
  let attempts = 0;
  await page.route("**/rpc/computer/boot", (route) => {
    attempts += 1;
    return route.abort("failed");
  });
  await page.goto("/app/chief?space=personal");
  await page.getByRole("button", { name: "Agent computer" }).click();
  const pane = page.getByTestId("side-panel");
  await expect(pane.getByRole("alert")).toHaveText("Could not reach the computer. Try again.");
  await expect(page.getByTestId("computer-preview-open")).toBeEnabled();
  await pane.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => Math.round((await pane.boundingBox())?.width ?? 0)).toBe(390);
  await captureScreenshot(page, testInfo, "computer-launch-error-mobile");
});

test("server owners can disclose computer setup guidance", async ({ page }) => {
  await fixture(page, { deploymentOwner: true });
  await page.goto("/app/chief?space=personal");
  await page.getByRole("button", { name: "Agent computer" }).click();
  const hint = page.getByTestId("computers-unavailable-hint");
  await hint.getByText("Server setup", { exact: true }).click();
  await expect(hint).toContainText("Configure a computer provider on the server");
  await expect(page.getByTestId("computer-preview-open")).toHaveCount(0);
});

test("Open waits for the computer screen already recovering in its panel", async ({ page }) => {
  await fixture(page, {
    computerAvailable: true,
    failed: true,
    computer: {
      botId: "chief",
      state: "running",
      mode: "team",
      kind: "fake",
      controlHolder: "bot",
      controlBotId: null,
      takeoverRequested: false,
      busyBotName: null,
      screenAvailable: false,
      screenWidth: 1280,
      screenHeight: 800,
      homeRevision: null,
      updateAvailable: false,
    },
  });
  let releaseBoot = () => {};
  const bootGate = new Promise<void>((resolve) => {
    releaseBoot = resolve;
  });
  let bootRequests = 0;
  let takeoverRequests = 0;
  await page.route("**/rpc/computer/boot", async (route) => {
    bootRequests += 1;
    if (bootRequests > 1) {
      // An overlapping manual boot cannot acquire the server's execution lease.
      await route.fulfill({
        status: 409,
        json: { code: "CONFLICT", message: "Computer is busy" },
      });
      return;
    }
    await bootGate;
    await route.fulfill({ json: { json: null } });
  });
  await page.route("**/rpc/computer/takeover", (route) => {
    takeoverRequests += 1;
    return route.fulfill({ json: { json: null } });
  });
  try {
    await page.goto("/app/chief?space=personal");
    await page.getByRole("button", { name: "Agent computer" }).click();
    await expect.poll(() => bootRequests).toBe(1);
    await page.getByTestId("computer-preview-open").click();
    releaseBoot();
    await expect(page.getByRole("button", { name: "Close computer" })).toBeVisible();
    expect(bootRequests).toBe(1);
    expect(takeoverRequests).toBe(1);
    await expect(page.getByRole("alert").filter({ hasText: "Computer is busy" })).toHaveCount(0);
  } finally {
    releaseBoot();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("workspace switches preserve drafts, attachments, running work and renderer identity", async ({
  page,
}, testInfo) => {
  const control = await fixture(page);
  await page.goto("/app/chief?space=personal");
  await expect(page.getByTestId("shell-root")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("workspace-switcher")).toContainText("Personal");
  await page.evaluate(() => {
    (window as unknown as { rendererIdentity: string }).rendererIdentity = "persistent";
  });
  const composer = page.getByRole("combobox", { name: "Message Chief" });
  await composer.fill("Keep this draft in Personal");
  await page.locator('input[type="file"]').setInputFiles({
    name: "brief.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic launch brief"),
  });
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.getByTestId("workspace-switcher").click();
  await captureScreenshot(page, testInfo, "workspace-dark-switcher");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await captureScreenshot(page, testInfo, "workspace-light-switcher");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page
    .getByRole("dialog", { name: "Workspaces" })
    .getByRole("button", { name: "Studio", exact: true })
    .click();
  await expect(page.getByTestId("workspace-switcher")).toContainText("Studio");
  await expect(page.getByRole("combobox", { name: "Message Research" })).toHaveValue("");
  await expect(page.getByText("brief.txt", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await page.getByTestId("workspace-switcher").click();
  await page.evaluate(() => {
    document.addEventListener(
      "click",
      function begin(event) {
        const target = (event.target as HTMLElement).closest("button");
        if (!target?.textContent?.startsWith("Personal")) return;
        document.removeEventListener("click", begin, true);
        const started = performance.now();
        const observer = new MutationObserver(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>(
            'textarea[aria-label="Message Chief"]',
          );
          if (textarea?.value !== "Keep this draft in Personal") return;
          observer.disconnect();
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              (window as unknown as { warmSwitchMs: number }).warmSwitchMs =
                performance.now() - started;
            }),
          );
        });
        observer.observe(document.body, { childList: true, subtree: true });
      },
      true,
    );
  });
  await page
    .getByRole("dialog", { name: "Workspaces" })
    .getByRole("button", { name: /^Personal/ })
    .click();
  await expect(composer).toHaveValue("Keep this draft in Personal");
  await expect(page.getByText("brief.txt", { exact: true })).toBeVisible();
  await expect(page.getByTestId("side-panel")).toHaveAttribute("data-panel", "files");
  await expect(page.getByRole("button", { name: "Stop", exact: true }).last()).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { rendererIdentity: string }).rendererIdentity),
  ).toBe("persistent");
  await testInfo.attach("warm-workspace-switch-ms", {
    body: String(
      await page.evaluate(() => (window as unknown as { warmSwitchMs: number }).warmSwitchMs),
    ),
    contentType: "text/plain",
  });
  await captureScreenshot(page, testInfo, "workspace-dark-restored");
  expect(control.errors).toEqual([]);
});

test("model picker, work pane and allowance remain usable in both themes and narrow layouts", async ({
  page,
}, testInfo) => {
  const control = await fixture(page, { theme: "light", exhausted: true });
  await page.goto("/app/chief?space=personal");
  await expect(page.getByTestId("transcript")).toContainText("thoughtful product launch");
  const assistantReply = page.locator('[data-message-role="bot"] .rk-assistant-message').first();
  await expect(assistantReply).toBeVisible();
  await expect(page.locator(".rk-shell-sidebar [data-avatar-family]").first()).toBeVisible();
  await expect(page.locator(".rk-shell-sidebar .rakazo-bot-avatar-visor")).toHaveCount(0);
  await expect(assistantReply).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(assistantReply).toHaveCSS("box-shadow", "none");
  await expect(page.locator(".rk-user-message").first()).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await captureScreenshot(page, testInfo, "workspace-light-conversation");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await captureScreenshot(page, testInfo, "workspace-dark-conversation");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.getByTestId("bot-model-picker").click();
  const picker = page.getByRole("dialog", { name: "Choose model" });
  await picker.getByRole("textbox", { name: "Search models" }).fill("reasoning");
  await expect(picker.getByRole("button", { name: /Reasoning/ })).toBeVisible();
  await captureScreenshot(page, testInfo, "workspace-light-models");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await captureScreenshot(page, testInfo, "workspace-dark-models");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await picker.getByRole("button", { name: /Reasoning/ }).click();
  await expect(page.getByTestId("bot-model-picker")).toContainText("Reasoning");
  await expect(page.getByTestId("bot-model-picker")).toBeFocused();
  await page.getByTestId("allowance-indicator").click();
  await expect(page.getByText("Your included balance is used.", { exact: false })).toBeVisible();
  await captureScreenshot(page, testInfo, "workspace-light-billing");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await captureScreenshot(page, testInfo, "workspace-dark-billing");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, testInfo, "workspace-mobile-light-chat");
  await page.getByTestId("bot-model-picker").click();
  await expect(picker).toBeVisible();
  expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBe(390);
  await captureScreenshot(page, testInfo, "workspace-mobile-light-models");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await captureScreenshot(page, testInfo, "workspace-mobile-dark-chat");
  await page.getByTestId("bot-model-picker").click();
  await captureScreenshot(page, testInfo, "workspace-mobile-dark-models");
  await page.keyboard.press("Escape");
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.getByTestId("allowance-indicator").click();
    await expect(page.getByText("Your included balance is used.", { exact: false })).toBeVisible();
    await captureScreenshot(page, testInfo, `workspace-mobile-${theme}-billing`);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.getByTestId("workspace-switcher").click();
    await captureScreenshot(page, testInfo, `workspace-mobile-${theme}-switcher`);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Close navigation", exact: true }).click();
  }
  expect(control.errors).toEqual([]);
});

test("system theme is applied before the renderer starts and respects an explicit choice", async ({
  page,
}) => {
  await page.route(/\/(?:src\/main\.tsx|assets\/index-[^/]+\.js)(?:\?|$)/, (route) =>
    route.abort("blockedbyclient"),
  );
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.locator("#root").textContent()).toBe("");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() => localStorage.setItem("rakazo.ui-theme", "light"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("account entry uses the shared brand and remains usable in both system themes", async ({
  page,
}, testInfo) => {
  await page.route("**/api/auth/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("get-session")
        ? { user: null, session: null }
        : { passwordReset: false, resetUrl: null, signupsEnabled: true },
    }),
  );
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "A workspace for your AI." })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await captureScreenshot(page, testInfo, `welcome-${theme}`);
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in to 2hands" })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill("alex@example.test");
    await page.getByLabel("Password", { exact: true }).fill("offline-example-password");
    await captureScreenshot(page, testInfo, `sign-in-${theme}`);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBe(390);
    await expect(
      page.getByRole("button", { name: "Continue with email", exact: true }),
    ).toBeEnabled();
    await captureScreenshot(page, testInfo, `sign-in-mobile-${theme}`);
  }
});

test("empty workspaces open a starter assistant without credentials", async ({
  page,
}, testInfo) => {
  await fixture(page);
  await page.goto("/app/chief?space=personal");
  await expect(page.locator('[data-roster-bot-id="chief"]')).toContainText(
    "Research and everyday work",
  );
  await page.getByTestId("workspace-switcher").click();
  await page
    .getByRole("dialog", { name: "Workspaces" })
    .getByRole("button", { name: "New project", exact: true })
    .click();
  await expect(page.getByRole("combobox", { name: "Message Chief" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect a model" })).toHaveCount(0);
  await expect(page.getByTestId("workspace-switcher")).toContainText("New project");
  const starterRow = page.locator('[data-roster-bot-id="project-chief"]');
  await expect(starterRow.getByText("Chief", { exact: true })).toHaveCount(1);
  await expect(starterRow).toContainText("Your next idea starts here");
  await captureScreenshot(page, testInfo, "workspace-empty-starter");
});

test("late responses from a previous workspace cannot overwrite the selected conversation", async ({
  page,
}) => {
  const control = await fixture(page);
  await page.goto("/app/chief?space=personal");
  await expect(page.getByTestId("shell-root")).toHaveAttribute("data-ready", "true");
  const pending = control.delayNextPersonalRead();
  await pending.started;
  await page.getByTestId("workspace-switcher").click();
  await page
    .getByRole("dialog", { name: "Workspaces" })
    .getByRole("button", { name: "Studio", exact: true })
    .click();
  await expect(page.getByRole("combobox", { name: "Message Research" })).toBeVisible();
  pending.release();
  await expect(page.getByTestId("transcript")).toContainText("Your research workspace is ready");
  await expect(page.getByTestId("transcript")).not.toContainText("thoughtful product launch");
  expect(
    control.requests
      .filter((request) => request.path === "bootstrap")
      .map((request) => request.space),
  ).toContain("studio");
  expect(control.errors).toEqual([]);
});

test("failed work keeps recovery and the composer visible at desktop and mobile sizes", async ({
  page,
}, testInfo) => {
  const control = await fixture(page, { failed: true });
  await page.goto("/app/chief?space=personal");
  const error = page.getByTestId("composer-error");
  await expect(error).toContainText("The model could not complete this task. Try again.");
  const composer = page.getByRole("combobox", { name: "Message Chief" });
  await composer.fill("Try a shorter launch brief");
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["dark", "light"] as const) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await captureScreenshot(page, testInfo, `workspace-${width}-${theme}-error`);
      expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBe(width);
    }
  }
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await expect(error).toHaveCount(0);
  await expect(composer).toHaveValue("Try a shorter launch brief");
  await expect(composer).toBeFocused();
  expect(control.errors).toEqual([]);
});

test("existing subscriptions show their included usage until renewal", async ({
  page,
}, testInfo) => {
  await fixture(page, { legacy: true, exhausted: true });
  await page.goto("/app/chief?space=personal");
  await expect(page.getByTestId("allowance-indicator")).toContainText("Plus plan");
  await page.getByTestId("allowance-indicator").click();
  await expect(
    page.getByText("Your current included usage continues until", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("meter")).toHaveCount(0);
  await expect(page.getByText("Your included balance is used.", { exact: false })).toHaveCount(0);
  await captureScreenshot(page, testInfo, "workspace-legacy-plan");
});

test("paid plan changes show renewal terms, preserve balance, and support undo and cancellation", async ({
  page,
}, testInfo) => {
  const control = await fixture(page, { paid: true, theme: "light" });
  let status: BillingPlanChangeStatus = {
    currentPlan: "plus",
    currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    pendingChange: null,
    canChange: true,
    canManageCancellation: true,
    unavailableReason: null,
  };
  const writes: Array<{ path: string; input: unknown }> = [];
  await page.route("**/rpc/billing/*", async (route) => {
    const path = new URL(route.request().url()).pathname.split("/").at(-1)!;
    if (path === "get") return route.fallback();
    if (path !== "planChangeStatus") {
      const input = route.request().postDataJSON()?.json ?? {};
      writes.push({ path, input });
      if (path === "schedulePlanChange")
        status = {
          ...status,
          pendingChange: { plan: input.plan, priceUsd: 60, effectiveAt: status.currentPeriodEnd! },
        };
      else if (path === "cancelPlanChange") status = { ...status, pendingChange: null };
      else if (path === "setCancelAtPeriodEnd")
        status = {
          ...status,
          cancelAtPeriodEnd: input.cancel,
          canChange: !input.cancel,
          unavailableReason: input.cancel
            ? "Keep your subscription before scheduling a plan change."
            : null,
          pendingChange: null,
        };
      else throw new Error(`Unexpected billing action ${path}`);
    }
    await route.fulfill({ json: { json: status } });
  });
  await page.goto("/app/chief?space=personal");
  await page.getByTestId("allowance-indicator").click();
  const billing = page.getByTestId("billing-plan-settings");
  await billing.getByRole("button", { name: "Pro $60", exact: true }).click();
  const confirmation = page.getByTestId("billing-confirmation");
  await expect(confirmation).toContainText("$60/month starting October 1, 2026, including $30");
  await expect(confirmation).toBeFocused();
  expect(writes).toHaveLength(0);
  await captureScreenshot(page, testInfo, "billing-light-renewal-confirmation");
  await billing.getByRole("button", { name: "Schedule change", exact: true }).click();
  await expect(billing.getByRole("status")).toContainText("Pro · $60/month from October 1, 2026");
  await expect(billing).toContainText("Plus · $20/mo");
  await expect(billing).toContainText("$9.66 of $10.00 remaining");
  expect(writes).toEqual([
    {
      path: "schedulePlanChange",
      input: { plan: "pro", expectedPeriodEnd: status.currentPeriodEnd },
    },
  ]);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await captureScreenshot(page, testInfo, "billing-dark-pending-change");
  await billing.getByRole("button", { name: "Undo change" }).click();
  await expect(billing.getByRole("status")).toHaveCount(0);
  await billing.getByRole("button", { name: "Cancel subscription", exact: true }).click();
  await expect(confirmation).toContainText("Subscription ends October 1, 2026");
  expect(writes).toHaveLength(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, testInfo, "billing-mobile-dark-cancel-confirmation");
  await billing.getByRole("button", { name: "Cancel at renewal" }).click();
  await expect(billing.getByRole("status")).toContainText("Subscription ends October 1, 2026");
  await expect(billing.getByRole("button", { name: "Pro $60", exact: true })).toBeDisabled();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await captureScreenshot(page, testInfo, "billing-mobile-light-canceled");
  expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBe(390);
  await billing.getByRole("button", { name: "Keep subscription" }).click();
  await expect(billing.getByRole("status")).toHaveCount(0);
  await expect(billing.getByRole("button", { name: "Pro $60", exact: true })).toBeEnabled();
  expect(writes.slice(2)).toEqual([
    {
      path: "setCancelAtPeriodEnd",
      input: { cancel: true, expectedPeriodEnd: status.currentPeriodEnd },
    },
    {
      path: "setCancelAtPeriodEnd",
      input: { cancel: false, expectedPeriodEnd: status.currentPeriodEnd },
    },
  ]);
  expect(control.errors).toEqual([]);
});

test("billing refresh reconciles an unknown write before another paid plan change", async ({
  page,
}, testInfo) => {
  const control = await fixture(page, { paid: true });
  let status: BillingPlanChangeStatus = {
    currentPlan: "plus",
    currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    pendingChange: null,
    canChange: true,
    canManageCancellation: true,
    unavailableReason: null,
  };
  let writes = 0;
  await page.route("**/rpc/billing/*", async (route) => {
    const path = new URL(route.request().url()).pathname.split("/").at(-1)!;
    if (path === "get") return route.fallback();
    if (path === "schedulePlanChange") {
      writes++;
      status = {
        ...status,
        pendingChange: { plan: "pro", priceUsd: 60, effectiveAt: status.currentPeriodEnd! },
      };
      await route.abort("failed");
      return;
    }
    if (path !== "planChangeStatus") throw new Error(`Unexpected billing action ${path}`);
    await route.fulfill({ json: { json: status } });
  });
  await page.goto("/app/chief?space=personal");
  await page.getByTestId("allowance-indicator").click();
  const billing = page.getByTestId("billing-plan-settings");
  await billing.getByRole("button", { name: "Pro $60", exact: true }).click();
  await billing.getByRole("button", { name: "Schedule change", exact: true }).click();
  await expect(billing.getByRole("alert")).toBeVisible();
  await expect(billing.getByRole("button", { name: "Pro $60", exact: true })).toBeDisabled();
  await captureScreenshot(page, testInfo, "billing-dark-recoverable-error");
  await billing.getByRole("button", { name: "Refresh billing" }).focus();
  await page.keyboard.press("Enter");
  await expect(billing.getByRole("status")).toContainText("Pro · $60/month from October 1, 2026");
  await expect(billing).toContainText("$9.66 of $10.00 remaining");
  expect(writes).toBe(1);
  expect(
    await page
      .getByTestId("user-settings")
      .evaluate((dialog) => dialog.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Tab");
  expect(
    await page
      .getByTestId("user-settings")
      .evaluate((dialog) => dialog.contains(document.activeElement)),
  ).toBe(true);
  expect(control.errors).toEqual([]);
});

test("past-due subscriptions retain cancellation and billing access while allowance is Free", async ({
  page,
}, testInfo) => {
  const control = await fixture(page, { pastDue: true, theme: "light" });
  let status: BillingPlanChangeStatus = {
    currentPlan: "plus",
    currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    pendingChange: null,
    canChange: false,
    canManageCancellation: true,
    unavailableReason: "Resolve this subscription in billing before changing plans.",
  };
  const writes: unknown[] = [];
  await page.route("**/rpc/billing/*", async (route) => {
    const path = new URL(route.request().url()).pathname.split("/").at(-1)!;
    if (path === "get") return route.fallback();
    if (path === "setCancelAtPeriodEnd") {
      const input = route.request().postDataJSON()?.json;
      writes.push(input);
      status = { ...status, cancelAtPeriodEnd: input.cancel };
    } else if (path !== "planChangeStatus") throw new Error(`Unexpected billing action ${path}`);
    await route.fulfill({ json: { json: status } });
  });
  await page.goto("/app/chief?space=personal");
  await page.getByTestId("allowance-indicator").click();
  const billing = page.getByTestId("billing-plan-settings");
  await expect(billing).toContainText("Free · $0/mo");
  await expect(billing.getByRole("button", { name: "Plus $20", exact: true })).toBeDisabled();
  await expect(billing.getByRole("button", { name: "Manage billing" })).toBeEnabled();
  await billing.getByRole("button", { name: "Cancel subscription", exact: true }).click();
  await billing.getByRole("button", { name: "Cancel at renewal" }).click();
  await expect(billing.getByRole("button", { name: "Keep subscription" })).toBeEnabled();
  await captureScreenshot(page, testInfo, "billing-light-past-due-cancellation");
  expect(writes).toEqual([{ cancel: true, expectedPeriodEnd: status.currentPeriodEnd }]);
  expect(control.errors).toEqual([]);
});
