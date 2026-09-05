import { expect, it } from "vitest";
import { testDatabaseUrl } from "./test-database-url.js";

it("only admits an explicitly named loopback test database", () => {
  expect(testDatabaseUrl(undefined)).toBeUndefined();
  expect(testDatabaseUrl("postgres://test:test@127.0.0.1:55439/app_test")).toContain("app_test");
  expect(() => testDatabaseUrl("postgres://test:test@db.example.com/app_test")).toThrow(/loopback/);
  expect(() => testDatabaseUrl("postgres://test:test@127.0.0.1/production")).toThrow(/_test/);
});
