import type { Actor, Bot } from "@rakazo/contracts";
import { CHIEF_OF_STAFF_SPAWN_KEY, chiefOfStaffBotInput } from "@rakazo/core";
import type { PrismaClient } from "./client.js";
import { createRepos, mapBot } from "./repos.js";

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

/** First-run teammate for an empty space. Idempotent via spawnKey. */
export async function ensureChiefOfStaffBot(prisma: PrismaClient, actor: Actor): Promise<Bot> {
  const repos = createRepos(prisma);
  const existing = await prisma.bot.findFirst({
    where: {
      spaceId: actor.spaceId,
      userId: actor.userId,
      archivedAt: null,
      spawnKey: CHIEF_OF_STAFF_SPAWN_KEY,
    },
    select: { id: true },
  });
  if (existing) return mapBot(await repos.getBot(actor, existing.id));

  const any = await prisma.bot.findFirst({
    where: { spaceId: actor.spaceId, userId: actor.userId, archivedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (any) return mapBot(await repos.getBot(actor, any.id));

  try {
    return await repos.createBot(actor, chiefOfStaffBotInput());
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await prisma.bot.findFirst({
      where: { spaceId: actor.spaceId, userId: actor.userId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!raced) throw error;
    return mapBot(await repos.getBot(actor, raced.id));
  }
}
