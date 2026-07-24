'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth-store'
import { useWorkspaceStore } from '@/store/workspace-store'

// Single supabase instance (singleton from client.ts)
const supabase = createClient()
const creditResetChecksByUserDay = new Set<string>()

// Module-level singleton: auth setup and the Supabase subscription run exactly
// once for the entire app lifetime. This means every call to useAuth() — on
// any page or component — reads the already-resolved state from Zustand
// instead of starting a fresh loading=true / user=null cycle on each mount.
let authSetupDone = false

function getStore() {
  return useAuthStore.getState()
}

function setupAuth() {
  if (authSetupDone) return
  authSetupDone = true

  const initAuth = async () => {
    try {
      // getSession() reads from the in-memory / localStorage cache — no network call,
      // no lock contention. getUser() validates against the server (network request)
      // and competes for the Supabase auth lock; calling it here races with signOut()
      // or token-refresh events and throws AbortError in Supabase ≥2.x.
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      const effectiveUser = session?.user ?? null

      if (sessionError) {
        console.warn('[useAuth] getSession error:', sessionError.message)
      }

      // Surface auth state immediately — profile fetch is non-blocking
      getStore().setUser(effectiveUser)
      getStore().setLoading(false)

      if (effectiveUser) {
        // Background: fetch profile without blocking workspace init
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', effectiveUser.id)
          .single()

        getStore().setProfile(profileData)

        // Background: daily credit reset check — let the server determine plan eligibility
        if (effectiveUser) {
          // Use the user's local calendar date (not UTC) as the dedup key
          // so credits reset at local midnight rather than UTC midnight
          const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
          const localDateStr = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone }) // YYYY-MM-DD
          const todayKey = `${effectiveUser.id}:${localDateStr}`
          if (!creditResetChecksByUserDay.has(todayKey)) {
            creditResetChecksByUserDay.add(todayKey)
            try {
              const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspace?.id
              const resetUrl = activeWorkspaceId
                ? `/api/credits/check-reset?workspaceId=${activeWorkspaceId}`
                : '/api/credits/check-reset'
              const resetRes = await fetch(resetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timezone: userTimezone }),
              })
              if (resetRes.ok) {
                const resetData = await resetRes.json()
                if (resetData.reset && activeWorkspaceId) {
                  // Refresh workspace credits in the store
                  const { data: freshWs } = await supabase
                    .from('workspaces')
                    .select('credits_balance, paid_credits_balance')
                    .eq('id', activeWorkspaceId)
                    .single()
                  if (freshWs) {
                    const wsData = freshWs as { credits_balance: number; paid_credits_balance: number }
                    const ws = useWorkspaceStore.getState().activeWorkspace
                    if (ws) {
                      useWorkspaceStore.getState().setActiveWorkspace({
                        ...ws,
                        credits: wsData.credits_balance,
                      })
                    }
                  }
                }
              }
            } catch (e) {
              console.warn('[useAuth] Credit reset check failed:', e)
            }
          }
        }
      } else {
        getStore().setProfile(null)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Auth lock was acquired by a concurrent operation (e.g. token refresh or signOut).
        // onAuthStateChange will emit the correct state — just stop loading.
        console.warn('[useAuth] initAuth aborted by concurrent auth op, waiting for state change')
        getStore().setLoading(false)
        return
      }
      console.error('useAuth init error:', error)
      getStore().setUser(null)
      getStore().setProfile(null)
      getStore().setLoading(false)
    }
  }

  initAuth()

  // Single long-lived subscription — handles sign-in, sign-out, token refresh
  supabase.auth.onAuthStateChange(async (event, session) => {
    const prevUser = getStore().user

    getStore().setUser(session?.user ?? null)
    getStore().setLoading(false)

    // Reset workspace only on explicit sign-out or genuine user switch.
    // TOKEN_REFRESHED events can briefly have no session and must NOT clear
    // the workspace — that causes the "workspace disappears" bug on navigation.
    const isSignOut = event === 'SIGNED_OUT'
    const isDifferentUser = !!(prevUser && session?.user && session.user.id !== prevUser.id)
    if (isSignOut || isDifferentUser) {
      useWorkspaceStore.getState().reset()
    }

    if (session?.user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      getStore().setProfile(profileData)
    } else {
      getStore().setProfile(null)
    }
  })
}

export function useAuth() {
  const { user, loading, profile, setProfile } = useAuthStore()

  // Trigger the singleton setup on first mount anywhere in the app
  useEffect(() => {
    setupAuth()
  }, [])

  const signOut = async () => {
    try {
      // Clear any local storage items that might persist
      try {
        localStorage.removeItem('2hands_create_workspace_intent')
      } catch {
        // Ignore localStorage errors
      }

      // supabase.auth.signOut() fires onAuthStateChange(SIGNED_OUT) which
      // calls setUser(null) and workspace reset — no need to duplicate here
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('[useAuth] Supabase signOut error:', error)
        throw error
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // AbortError means the fetch was interrupted mid-flight, but the server
        // has already invalidated the session token. Treat as a successful sign-out:
        // clear local state and let the caller redirect without surfacing an error.
        console.warn('[useAuth] signOut fetch aborted (token likely invalidated server-side)')
        getStore().setUser(null)
        getStore().setProfile(null)
        useWorkspaceStore.getState().reset()
        return
      }
      console.error('[useAuth] signOut failed:', error)
      // Still clear local state even if Supabase fails
      getStore().setUser(null)
      getStore().setProfile(null)
      useWorkspaceStore.getState().reset()
      throw error
    }
  }

  const refreshProfile = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (currentUser) {
      const { data: refreshed } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single()
      if (refreshed) setProfile(refreshed)
    }
  }

  return { user, profile, loading, signOut, refreshProfile }
}
