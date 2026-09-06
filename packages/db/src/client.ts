import { PrismaPg } from "@prisma/adapter-pg";
import { postgresPoolLimits } from "@rakazo/core";
import { Pool } from "pg";
import { PrismaClient } from "./generated/prisma/client.js";

export type Db = PrismaClient;

export function createDb(connectionString: string): { prisma: PrismaClient; pool: Pool } {
  const { prismaMax } = postgresPoolLimits(connectionString);
  const pool = new Pool({
    connectionString,
    max: prismaMax,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
}

export type { Pool } from "pg";
export * from "./generated/prisma/client.js";
export { Prisma, PrismaClient } from "./generated/prisma/client.js";
