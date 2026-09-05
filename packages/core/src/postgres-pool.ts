export interface PostgresPoolLimits {
  prismaMax: number;
  graphileMaxPoolSize: number;
  graphileConcurrency: number;
}

const DEFAULT_LIMITS: PostgresPoolLimits = {
  prismaMax: 10,
  graphileMaxPoolSize: 10,
  graphileConcurrency: 4,
};

/** Session-mode Supabase pooler (port 5432) caps clients at pool_size, often 15. */
const SESSION_POOLER_LIMITS: PostgresPoolLimits = {
  prismaMax: 2,
  graphileMaxPoolSize: 2,
  graphileConcurrency: 1,
};

function parsePostgresUrl(connectionString: string): URL | null {
  try {
    return new URL(connectionString);
  } catch {
    return null;
  }
}

export function isSupabaseSessionPooler(connectionString: string): boolean {
  const url = parsePostgresUrl(connectionString);
  if (!url) return false;
  const port = url.port || "5432";
  return url.hostname.includes("pooler.supabase.com") && port === "5432";
}

export function postgresPoolLimits(connectionString: string): PostgresPoolLimits {
  const url = parsePostgresUrl(connectionString);
  const fromQuery = url?.searchParams.get("connection_limit");
  const parsed = fromQuery ? Number(fromQuery) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    const prismaMax = Math.floor(parsed);
    return {
      prismaMax,
      graphileMaxPoolSize: Math.max(1, Math.min(2, prismaMax)),
      graphileConcurrency: 1,
    };
  }
  if (isSupabaseSessionPooler(connectionString)) return SESSION_POOLER_LIMITS;
  return DEFAULT_LIMITS;
}
