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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    return () => subscription.unsubscribe()
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
    if (result.type !== 'success' || !result.url) return

    const { queryParams } = Linking.parse(result.url)

    const returnedError = firstParam(queryParams?.error)
    if (returnedError) {
      throw new Error(firstParam(queryParams?.error_description) || returnedError)
    }

    const code = firstParam(queryParams?.code)
    if (!code) return

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      throw exchangeError
    }
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
