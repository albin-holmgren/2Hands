'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useWorkspaceStore, getPersistedWorkspaceId } from '@/store/workspace-store'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { persistLastPath } from '@/lib/auth/last-path'

const INIT_TIMEOUT_MS = 10_000

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { initialized, setWorkspaces, setActiveWorkspace, setUserRole, setPendingInviteCount, setInitialized } = useWorkspaceStore()
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const retryCountRef = useRef(0)
  const initializingRef = useRef(false)

  // When user identity changes (sign-out / different user signs in), reset all
  // init-related refs so the workspace can initialize cleanly for the new user
  useEffect(() => {
    initializingRef.current = false
    retryCountRef.current = 0
  }, [user?.id])

  // Persist the last visited dashboard path so sign-in can restore it.
  // persistLastPath() excludes /app/legacy — otherwise one visit to the legacy
  // dashboard permanently hijacks the post-login landing page.
  useEffect(() => {
    if (!pathname) return
    persistLastPath(pathname)
  }, [pathname])

  useEffect(() => {
    if (initialized || loading || !user) return
    // Prevent concurrent init calls (React Strict Mode double-invoke, rapid re-renders)
    if (initializingRef.current) return
    initializingRef.current = true

    async function init() {
      let willRetry = false

      // Abort if init takes too long (cold Supabase start, network issue, etc.)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), INIT_TIMEOUT_MS)

      try {
        // Fetch workspace list and pending invites in parallel — saves one round-trip
        const [wsRes, invRes] = await Promise.all([
          fetch('/api/teams', { signal: controller.signal }),
          fetch('/api/teams?action=pending-invites', { signal: controller.signal }),
        ])

        clearTimeout(timeoutId)

        if (wsRes.status === 401) {
          console.warn('[WorkspaceProvider] 401 from /api/teams — signing out')
          const supabase = createClient()
          await supabase.auth.signOut()
          router.push('/sign-in')
          return
        }

        if (!wsRes.ok) {
          if (retryCountRef.current < 2) {
            retryCountRef.current += 1
            willRetry = true
            console.warn(`[WorkspaceProvider] /api/teams failed (${wsRes.status}), retrying in 2s (attempt ${retryCountRef.current})`)
            setTimeout(() => {
              initializingRef.current = false
              setInitialized(false)
            }, 2000)
          } else {
            console.error('[WorkspaceProvider] /api/teams failed after retries — giving up')
          }
          return
        }

        const data = await wsRes.json()
        let ws = data.workspaces || []

        // Auto-create personal workspace if none exist
        if (ws.length === 0) {
          const createRes = await fetch('/api/teams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ensure_personal_workspace' }),
          })
          if (createRes.ok) {
            const d = await createRes.json()
            if (d.workspace) ws = [d.workspace]
          }
        }

        setWorkspaces(ws)

        if (ws.length > 0) {
          const persistedId = getPersistedWorkspaceId()
          const target = (persistedId && ws.find((w: { id: string }) => w.id === persistedId)) || ws[0]
          setActiveWorkspace(target)

          // Fetch role + workspace details (includes live credits) in parallel
          const [roleRes] = await Promise.all([
            fetch(`/api/teams?workspaceId=${target.id}`, { signal: controller.signal }),
            // Fire-and-forget daily reset check — updates DB if 24h have elapsed; we don't need to await it
            fetch(`/api/credits/check-reset?workspaceId=${target.id}`, { method: 'POST', signal: controller.signal })
              .then(async r => {
                if (r.ok) {
                  const d = await r.json()
                  // If a reset just happened, patch the store with the new balance
                  if (d.reset && d.credits != null) {
                    setActiveWorkspace({ ...target, credits: d.credits })
                  }
                }
              })
              .catch(() => {}),
          ])
          if (roleRes.ok) {
            const roleData = await roleRes.json()
            setUserRole(roleData.role || null)
            // Patch in live credits from the workspace object in the role response
            const liveCredits = roleData.workspace?.credits
            if (liveCredits != null) {
              setActiveWorkspace({ ...target, credits: liveCredits })
            }
          } else if (target.isPersonal) {
            setUserRole('owner')
          }
        }

        // Consume parallel pending invites response
        if (invRes.ok) {
          const invData = await invRes.json()
          setPendingInviteCount((invData.invites || []).length)
        }
      } catch (err) {
        clearTimeout(timeoutId)
        if ((err as Error)?.name === 'AbortError') {
          console.error('[WorkspaceProvider] init timed out after 10s')
        } else {
          console.error('[WorkspaceProvider] Failed to initialize workspace:', err)
        }
        if (retryCountRef.current < 2) {
          retryCountRef.current += 1
          willRetry = true
          setTimeout(() => {
            initializingRef.current = false
            setInitialized(false)
          }, 2000)
        }
      } finally {
        // Only mark as initialized if we are NOT planning to retry.
        // A premature setInitialized(true) would leave the store in an empty
        // state before the retry fires, causing a blank workspace screen.
        if (!willRetry) {
          setInitialized(true)
          initializingRef.current = false
        }
      }
    }

    init()
  }, [initialized, loading, user, setWorkspaces, setActiveWorkspace, setUserRole, setPendingInviteCount, setInitialized, router])

  // Realtime subscription: keep credits_balance in sync as agents spend credits
  const { activeWorkspace } = useWorkspaceStore()
  useEffect(() => {
    if (!activeWorkspace?.id) return
    const supabase = createClient()
    const channel = supabase
      .channel(`workspace-credits-${activeWorkspace.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workspaces',
          filter: `id=eq.${activeWorkspace.id}`,
        },
        (payload) => {
          const updated = payload.new as { credits_balance?: number; paid_credits_balance?: number }
          if (updated.credits_balance != null) {
            setActiveWorkspace({ ...activeWorkspace, credits: updated.credits_balance })
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>
}
