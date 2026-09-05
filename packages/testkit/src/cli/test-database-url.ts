/** An explicit disposable local database can replace Docker in developer verification. */
export function testDatabaseUrl(value: string | undefined) {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname)
  ) {
    throw new Error(
      "TEST_DATABASE_URL must address an explicit loopback database ending in _test.",
    );
  }
  return url.toString();
}
