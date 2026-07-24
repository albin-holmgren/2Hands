'use client'

/**
 * /app/v3 — the v3 voice-first conversation surface (IMPLEMENTATION_MAP
 * Slice 1). Auth follows the existing (dashboard) pattern: the route-group
 * layout enforces the server-side session guard and provides the workspace
 * context; the client shell uses the same useAuth/useWorkspaceStore hooks as
 * `(dashboard)/app/page.tsx`.
 *
 * The shell reads `?demo=cards` via useSearchParams, hence the Suspense
 * boundary Next.js requires around it.
 */

import { Suspense } from 'react'

import { V3Shell } from '@/components/v3/shell/v3-shell'

export default function V3Page() {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-background" aria-hidden />}>
      <V3Shell />
    </Suspense>
  )
}
