/**
 * "Last visited path" persistence, shared by the workspace provider (writer),
 * the sign-in page (reader) and useAuth().signOut (cleanup).
 *
 * v3 cutover note: the legacy dashboard (/app/legacy) must never be persisted
 * or restored. Before this was enforced, any user who had ever opened the
 * legacy dashboard kept landing there after every sign-in, indefinitely.
 */

export const LAST_PATH_KEY = '2hands_last_path'

/** Path prefixes that are worth restoring after sign-in. */
const PERSISTED_PATH_PREFIXES = ['/app', '/settings']

/** Path prefixes that must never become a sticky landing target. */
const EXCLUDED_PATH_PREFIXES = ['/app/legacy']

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** True when `pathname` may be stored as the restore target. */
export function isPersistableLastPath(pathname: string): boolean {
  if (!pathname.startsWith('/')) return false
  if (matchesPrefix(pathname, EXCLUDED_PATH_PREFIXES)) return false
  return matchesPrefix(pathname, PERSISTED_PATH_PREFIXES)
}

export function persistLastPath(pathname: string): void {
  if (!isPersistableLastPath(pathname)) return
  try {
    localStorage.setItem(LAST_PATH_KEY, pathname)
  } catch {
    // Ignore localStorage errors (private mode, quota, SSR)
  }
}

/**
 * Read the stored path, re-validating it against the current rules so that a
 * value written by an older build (e.g. `/app/legacy`) is not honoured.
 */
export function readLastPath(): string | null {
  try {
    const stored = localStorage.getItem(LAST_PATH_KEY)
    if (!stored) return null
    if (!isPersistableLastPath(stored)) {
      localStorage.removeItem(LAST_PATH_KEY)
      return null
    }
    return stored
  } catch {
    return null
  }
}

export function clearLastPath(): void {
  try {
    localStorage.removeItem(LAST_PATH_KEY)
  } catch {
    // Ignore localStorage errors
  }
}
