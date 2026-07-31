import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from './supabase'

// Wrap in try-catch to prevent crash during module initialization
try {
  WebBrowser.maybeCompleteAuthSession()
} catch (e) {
  console.warn('[Auth] maybeCompleteAuthSession failed:', e)
}

interface AuthContextType {
  session: Session | null
  user: User | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  signInWithOAuth: (provider: 'google') => Promise<void>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/** Deep-link query params can arrive as a string or a repeated-key array. */
function firstParam(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value
  return typeof single === 'string' && single.length > 0 ? single : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    /**
     * Restore the session, then check the server still accepts it.
     *
     * getSession() only reads persisted storage — it will happily return a
     * token for a user that no longer exists. The app then looks signed in
     * while every authenticated request comes back 401, which reads as "the
     * API is broken" rather than "you need to sign in again". getUser() is the
     * call that actually asks the server.
     */
    const restore = async () => {
      const {
        data: { session: stored },
      } = await supabase.auth.getSession()

      if (!active) return

      if (!stored) {
        setSession(null)
        setUser(null)
        setIsLoading(false)
        return
      }

      const { data, error } = await supabase.auth.getUser()
      if (!active) return

      // Only discard the session when the server actively rejects it. A
      // network blip must not sign someone out — treat unreachable as
      // "assume valid and carry on", since the next real request will fail
      // loudly anyway.
      const rejected =
        error != null &&
        typeof (error as { status?: number }).status === 'number' &&
        [401, 403].includes((error as { status?: number }).status as number)

      if (rejected) {
        await supabase.auth.signOut().catch(() => undefined)
        if (!active) return
        setSession(null)
        setUser(null)
        setIsLoading(false)
        return
      }

      setSession(stored)
      setUser(data?.user ?? stored.user ?? null)
      setIsLoading(false)
    }

    void restore()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })
    return { error: error as Error | null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const resetPassword = async (email: string) => {
    const redirectTo = Linking.createURL('auth/reset')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })
    return { error: error as Error | null }
  }

  const signInWithOAuth = async (provider: 'google') => {
    const redirectTo = Linking.createURL('auth/callback')
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        // Without this, auth-js navigates the page itself on the Expo web
        // target (app.json declares one) while openAuthSessionAsync also
        // fires — a double navigation. Harmless but required on native too,
        // since we always drive the browser ourselves.
        skipBrowserRedirect: true,
      },
    })

    if (error) {
      throw error
    }

    if (!data?.url) return

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

    // On iOS, ASWebAuthenticationSession intercepts the redirect and hands it
    // back here as `result.url` — no deep link is delivered to the app, so
    // app/auth/callback.tsx never runs. Discarding this result meant Google
    // sign-in could never complete on iOS. Android does fire a real deep link;
    // the callback screen remains the fallback for that path.
    // 'cancel'/'dismiss' means the user backed out — not an error worth showing.
    if (result.type !== 'success' || !result.url) return

    // Supabase returns the PKCE code in the query string, but an implicit-flow
    // response puts tokens in the URL *fragment*, which Linking.parse ignores
    // entirely. Reading only queryParams meant a fragment response produced no
    // code, and the function returned silently: browser closes, no error, still
    // logged out. Parse both.
    const { queryParams } = Linking.parse(result.url)
    const fragment = result.url.includes('#')
      ? new URLSearchParams(result.url.slice(result.url.indexOf('#') + 1))
      : new URLSearchParams()

    const param = (name: string) => firstParam(queryParams?.[name]) || fragment.get(name) || null

    const returnedError = param('error')
    if (returnedError) {
      throw new Error(param('error_description') || returnedError)
    }

    const code = param('code')
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      if (exchangeError) throw exchangeError
      return
    }

    const accessToken = param('access_token')
    const refreshToken = param('refresh_token')
    if (accessToken && refreshToken) {
      const { error: setError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (setError) throw setError
      return
    }

    // Getting here means the provider came back without anything we can turn
    // into a session. Say so rather than returning quietly — a silent no-op is
    // indistinguishable from the app being broken.
    throw new Error('Sign-in returned no credentials. Please try again.')
  }

  return (
    <AuthContext.Provider value={{
      session,
      user,
      isLoading,
      signIn,
      signUp,
      signOut,
      signInWithOAuth,
      resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
