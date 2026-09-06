import { CHIEF_OF_STAFF_SPAWN_KEY } from "@rakazo/core";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { ensureChiefOfStaffBot } from "./ensure-chief-of-staff.js";

const getBot = vi.fn(async (_actor: unknown, id: string) => ({ id, name: "Chief of Staff" }));
const createBot = vi.fn(async () => ({ id: "created-cos", name: "Chief of Staff" }));

vi.mock("./repos.js", () => ({
  createRepos: () => ({ getBot, createBot }),
  mapBot: (bot: unknown) => bot,
}));

const actor = {
  userId: "user-1",
  spaceId: "space-1",
  email: "user@example.com",
  isDeploymentOwner: true,
};

describe("ensureChiefOfStaffBot", () => {
  it("returns the existing chief of staff without creating another bot", async () => {
    const prisma = {
      bot: {
        findFirst: vi.fn(async () => ({ id: "cos-1" })),
      },
    };
    const bot = await ensureChiefOfStaffBot(prisma as unknown as PrismaClient, actor);
    expect(bot.id).toBe("cos-1");
    expect(createBot).not.toHaveBeenCalled();
    expect(prisma.bot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ spawnKey: CHIEF_OF_STAFF_SPAWN_KEY }),
      }),
    );
  });

  it("creates Chief of Staff when the space has no bots", async () => {
    createBot.mockClear();
    const prisma = {
      bot: {
        findFirst: vi.fn(async () => null),
      },
    };
    const bot = await ensureChiefOfStaffBot(prisma as unknown as PrismaClient, actor);
    expect(bot.id).toBe("created-cos");
    expect(createBot).toHaveBeenCalledTimes(1);
  });
});
