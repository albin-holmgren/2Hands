/** Never restore draft bytes from a network URL or outside this app container. */
export function isPrivateFileUri(uri: string, roots: readonly string[]): boolean {
  const path = (value: string) => {
    const parsed = new URL(value);
    if (parsed.protocol !== "file:" || parsed.host || parsed.search || parsed.hash) return null;
    return new URL(`file://${decodeURIComponent(parsed.pathname)}`).pathname;
  };
  try {
    const candidate = path(uri);
    return (
      candidate !== null &&
      roots.some((root) => {
        const allowed = path(root);
        return allowed !== null && candidate.startsWith(`${allowed.replace(/\/+$/, "")}/`);
      })
    );
  } catch {
    return false;
  }
}
