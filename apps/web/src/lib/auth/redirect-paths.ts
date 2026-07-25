/**
 * Single source of truth for post-auth redirect validation.
 *
 * This logic used to be duplicated in `src/lib/supabase/middleware.ts` and
 * `src/app/auth/callback/route.ts`. The two copies had drifted: the callback
 * allowed `/reset-password` but the middleware did not, and they defaulted to
 * different landing pages (`/app` vs `/app/v3`). Both now import from here.
 */

/**
 * The application home. v3 cutover: 2hands.ai IS the app — signing in and
 * hitting the root both land here (the legacy dashboard lives at /app/legacy).
 */
export const APP_HOME = '/app/v3'

/** Allowlist of valid redirect path prefixes (must start with /). */
export const ALLOWED_REDIRECT_PREFIXES = [
  '/app',
  '/settings',
  '/pricing',
  // Password recovery links land here with a live recovery session.
  '/reset-password',
]

/**
 * Validate a redirect path to prevent open-redirect attacks.
 * Only allows relative paths that match the allowlist; anything else falls
 * back to the application home.
 */
export function validateRedirectPath(path: string | null | undefined): string {
  if (!path) return APP_HOME

  // Must be a relative path (starts with /)
  if (!path.startsWith('/')) return APP_HOME

  // Block absolute URLs and protocol-relative URLs
  if (path.startsWith('//') || path.includes('://')) return APP_HOME

  // Block paths with encoded characters that could bypass the checks above
  if (path.includes('%') || path.includes('\\')) return APP_HOME

  const isAllowed = ALLOWED_REDIRECT_PREFIXES.some(
    (allowed) =>
      path === allowed ||
      path.startsWith(`${allowed}/`) ||
      path.startsWith(`${allowed}?`)
  )

  return isAllowed ? path : APP_HOME
}
