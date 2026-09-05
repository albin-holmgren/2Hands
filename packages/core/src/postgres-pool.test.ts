import { describe, expect, it } from "vitest";
import { isSupabaseSessionPooler, postgresPoolLimits } from "./postgres-pool.js";

describe("postgresPoolLimits", () => {
  it("keeps node-postgres defaults for a local database", () => {
    expect(postgresPoolLimits("postgres://rakazo:rakazo@127.0.0.1:5433/rakazo")).toEqual({
      prismaMax: 10,
      graphileMaxPoolSize: 10,
      graphileConcurrency: 4,
    });
    expect(isSupabaseSessionPooler("postgres://rakazo:rakazo@127.0.0.1:5433/rakazo")).toBe(false);
  });

  it("caps the session-mode Supabase pooler so API and worker fit in pool_size 15", () => {
    const url =
      "postgresql://app.ref:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require";
    expect(isSupabaseSessionPooler(url)).toBe(true);
    expect(postgresPoolLimits(url)).toEqual({
      prismaMax: 2,
      graphileMaxPoolSize: 2,
      graphileConcurrency: 1,
    });
  });

  it("does not treat the transaction pooler as the session cap", () => {
    const url =
      "postgresql://app.ref:secret@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require";
    expect(isSupabaseSessionPooler(url)).toBe(false);
    expect(postgresPoolLimits(url).prismaMax).toBe(10);
  });

  it("honors connection_limit on the URL", () => {
    expect(
      postgresPoolLimits("postgres://rakazo:rakazo@127.0.0.1:5433/rakazo?connection_limit=5"),
    ).toEqual({
      prismaMax: 5,
      graphileMaxPoolSize: 2,
      graphileConcurrency: 1,
    });
  });
});
