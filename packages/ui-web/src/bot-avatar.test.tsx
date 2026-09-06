import { readFileSync } from "node:fs";
import { avatarIdentitySeed, CHIEF_OF_STAFF_COLOR } from "@rakazo/core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvatarStyleProvider } from "./avatar-style.js";
import { BotAvatar } from "./bot-avatar.js";

describe("BotAvatar", () => {
  it("renders distinct SVG gradient IDs for concurrent working avatars", () => {
    const html = renderToString(
      <div>
        <BotAvatar color="#8B5CF6" status="running" />
        <BotAvatar color="#10B981" status="running" />
      </div>,
    );

    const gradMatches = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(gradMatches).toHaveLength(4);
    expect(new Set(gradMatches).size).toBe(4);
    expect(gradMatches[0]).toBeTruthy();
    expect(gradMatches[1]).toBeTruthy();
    expect(gradMatches[0]).not.toBe(gradMatches[1]);

    for (const id of gradMatches) expect(html).toContain(`url(#${id})`);
  });

  it.each(["running", "queued", "leased", "waiting_input", "waiting_takeover"])(
    "renders active working ring for %s status",
    (status) => {
      const html = renderToString(<BotAvatar color="#3B82F6" status={status} />);
      expect(html).toContain("<svg");
      expect(html).toContain("rakazo-bot-avatar-ring");
    },
  );

  it("keeps the working ring mounted when idle so its timeline does not reset", () => {
    const html = renderToString(<BotAvatar color="#F59E0B" status="idle" />);
    expect(html).toContain('data-working="false"');
    expect(html).toContain("rakazo-bot-avatar-ring");
  });

  it("keeps identity and geometry stable when a task starts", () => {
    const idle = renderToString(<BotAvatar color="#3EC5A8" identity="research" status="idle" />);
    const running = renderToString(
      <BotAvatar color="#3EC5A8" identity="research" status="running" />,
    );
    expect(idle.match(/data-avatar-family="([^"]+)"/)?.[1]).toBe(
      running.match(/data-avatar-family="([^"]+)"/)?.[1],
    );
    expect(idle.match(/<path d="([^"]+)"/)?.[1]).toBe(running.match(/<path d="([^"]+)"/)?.[1]);
    expect(idle).toContain("#4B73FF");
    expect(idle).not.toContain("rakazo-bot-avatar-visor");
  });

  it("preserves a custom color with contrasting eyes", () => {
    const html = renderToString(<BotAvatar color="#FFF3C4" identity="custom" />);
    expect(html).toContain("#FFF3C4");
    expect(html).toContain('fill="#252529"');
  });

  it.each(["#D97757", "#F5A03C", "#34C759", "#6A6BF5", "#9B5CF6", "#3B82F6", "#F2622A"])(
    "uses the approved palette for shipped bot color %s",
    (color) => {
      const html = renderToString(<BotAvatar color={color} identity="default-assistant" />);
      expect(html).toMatch(/#4B73FF|#8876DC|#DB6B70/);
      expect(html).toContain('fill="#FAF8F5"');
      expect(html).not.toContain(color);
    },
  );

  it("uses the approved family for the organic account default", () => {
    const html = renderToString(
      <AvatarStyleProvider value="organic">
        <BotAvatar color={CHIEF_OF_STAFF_COLOR} identity="chief-of-staff" />
      </AvatarStyleProvider>,
    );
    expect(html).toContain("#DB6B70");
    expect(html).toContain('fill="#FAF8F5"');
    expect(html).not.toContain(CHIEF_OF_STAFF_COLOR);
    expect(html).toContain("rakazo-organic-avatar");
    expect(html).toContain("data-avatar-family");
    expect(html).not.toContain("rakazo-bot-avatar-visor");
  });

  it("keeps the classic robot preference and lets an explicit variant override it", () => {
    const classic = renderToString(
      <AvatarStyleProvider value="robot">
        <BotAvatar color="#D9508A" identity="maya" />
      </AvatarStyleProvider>,
    );
    expect(classic).toContain("rakazo-bot-avatar-visor");
    expect(classic).toContain("rakazo-bot-avatar-eyes-idle");
    expect(classic).toContain("rakazo-bot-avatar-eyes-working");
    const override = renderToString(
      <AvatarStyleProvider value="robot">
        <BotAvatar color="#D9508A" identity="maya" variant="organic" />
      </AvatarStyleProvider>,
    );
    expect(override).toContain("data-avatar-family");
    expect(override).not.toContain("rakazo-bot-avatar-visor");
  });

  it("assigns stable distinct silhouettes across the character family", () => {
    const identities = new Map<number, string>();
    for (let index = 0; index < 100 && identities.size < 3; index++) {
      const identity = `avatar-${index}`;
      identities.set(avatarIdentitySeed(identity) % 3, identity);
    }
    const families = new Set<string>();
    for (const identity of identities.values()) {
      const html = renderToString(<BotAvatar color="#D9508A" identity={identity} />);
      families.add(html.match(/data-avatar-family="([^"]+)"/)![1]!);
    }
    expect(families.size).toBe(3);
  });

  it.each(["organic", "robot"] as const)(
    "keeps the %s working ring mounted without restarting its animation",
    (variant) => {
      for (const status of ["idle", "running", "waiting_takeover"]) {
        const html = renderToString(
          <BotAvatar color="#D9508A" status={status} variant={variant} />,
        );
        expect(html).toContain("rakazo-bot-avatar-ring");
        expect(html).toContain(`data-working="${status !== "idle"}"`);
      }
      const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
      expect(css).not.toMatch(/data-working[^}]+animation:/s);
      expect(css).toMatch(
        /prefers-reduced-motion: reduce[\s\S]*rakazo-bot-avatar-ring[\s\S]*animation: none/,
      );
    },
  );
});
