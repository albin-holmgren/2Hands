'use client'

/**
 * The sign-in / sign-up form, shared by the /sign-in page and the in-app auth
 * dialog.
 *
 * It lived inside the page component until the dialog needed it too. Copying it
 * would have created exactly the drift this codebase already paid for once, when
 * the middleware and the auth callback kept separate redirect allowlists that
 * disagreed with each other (see lib/auth/redirect-paths.ts).
 *
 * The form never reads the URL itself: the page passes what it parsed from
 * searchParams, and the dialog passes its own destination. That keeps it usable
 * anywhere without dragging a Suspense boundary along.
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ArrowLeft, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { readLastPath } from '@/lib/auth/last-path'
import { APP_HOME } from '@/lib/auth/redirect-paths'

type AuthStep = 'email' | 'signin' | 'signup'

export interface AuthFormProps {
  /** Post-login destination, usually the `next` query param. */
  nextPath?: string | null
  /** Referral code to attribute a new signup to. */
  referralCode?: string | null
  /**
   * Called after a successful password sign-in. Provide this to stay put — the
   * dialog closes and refreshes instead of navigating. Without it the form
   * routes to the post-login path itself.
   */
  onSignedIn?: () => void
  /** Replaces the default line under the heading. */
  subheading?: string
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

const FIELD_CLASS =
  'w-full min-h-12 px-6 py-3 rounded-3xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground outline-none focus:border-foreground/30 transition-colors'

const SUBMIT_CLASS =
  'w-full min-h-[44px] rounded-full bg-foreground text-background font-bold text-sm transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed active:scale-[0.98]'

export function AuthForm({
  nextPath,
  referralCode,
  onSignedIn,
  subheading,
}: AuthFormProps) {
  const [step, setStep] = useState<AuthStep>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const router = useRouter()

  const supabase = createClient()

  const getPostLoginPath = useCallback((): string => {
    // 1. ?next= from middleware (the user was heading somewhere specific), or
    //    the destination the dialog was opened with.
    if (nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')) return nextPath
    // 2. Last visited path. readLastPath() re-validates, so a stale
    //    '/app/legacy' from before the v3 cutover cannot become a permanent
    //    landing page.
    const stored = readLastPath()
    if (stored) return stored
    return APP_HOME
  }, [nextPath])

  const handleOAuth = useCallback(async () => {
    try {
      // Carry ?next= and ?ref= through the provider round-trip: without them a
      // deep link is lost on the way back, and referral attribution never runs
      // (the callback reads `ref` from its own URL).
      const callbackUrl = new URL('/auth/callback', window.location.origin)
      callbackUrl.searchParams.set('next', getPostLoginPath())
      if (referralCode) callbackUrl.searchParams.set('ref', referralCode)

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl.toString() },
      })
      if (error) toast.error(error.message)
    } catch {
      toast.error('An error occurred. Please try again.')
    }
  }, [supabase.auth, getPostLoginPath, referralCode])

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!email.trim()) return

      setIsCheckingEmail(true)
      try {
        const res = await fetch('/api/auth/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        })
        const { exists } = await res.json()
        setStep(exists ? 'signin' : 'signup')
      } catch {
        // Default to sign-in on error
        setStep('signin')
      } finally {
        setIsCheckingEmail(false)
      }
    },
    [email],
  )

  const handleSignIn = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setIsLoading(true)
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          toast.error(error.message)
          return
        }
        toast.success('Welcome back!')
        if (onSignedIn) {
          // Caller stays where it is; refresh so server components pick up the
          // new session.
          router.refresh()
          onSignedIn()
        } else {
          router.push(getPostLoginPath())
          router.refresh()
        }
      } catch {
        toast.error('An error occurred. Please try again.')
      } finally {
        setIsLoading(false)
      }
    },
    [email, password, supabase.auth, router, onSignedIn, getPostLoginPath],
  )

  const handleSignUp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setIsLoading(true)
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        if (error) {
          toast.error(error.message)
          return
        }
        if (referralCode && data.user) {
          try {
            await fetch('/api/referral', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ referralCode }),
            })
          } catch {
            /* ignore */
          }
        }
        toast.success('Check your email to confirm your account!')
        setStep('signin')
      } catch {
        toast.error('An error occurred. Please try again.')
      } finally {
        setIsLoading(false)
      }
    },
    [email, password, fullName, supabase.auth, referralCode],
  )

  const goBack = useCallback(() => {
    setPassword('')
    setFullName('')
    setStep('email')
  }, [])

  const defaultSubheading =
    step === 'email' ? undefined : step === 'signin'
      ? 'Welcome back! Enter your password to sign in'
      : 'Create your account to get started'

  return (
    <>
      <p className="text-[15px] text-muted-foreground">
        {step === 'email'
          ? subheading ?? (
              <>
                Sign in or sign up for free
                <br />
                with your work email
              </>
            )
          : defaultSubheading}
      </p>

      <div className="mt-6">
        <AnimatePresence mode="wait">
          {step === 'email' && (
            <motion.div
              key="email-step"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <button
                onClick={handleOAuth}
                className="w-full h-[44px] flex items-center justify-center gap-3 rounded-full border border-border bg-background hover:bg-foreground/5 text-foreground font-medium text-[14px] transition-all active:scale-[0.98]"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              <div className="relative flex items-center py-1">
                <div className="flex-1 border-t border-border" />
                <span className="px-3 text-[13px] text-muted-foreground">or</span>
                <div className="flex-1 border-t border-border" />
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <input
                  type="email"
                  placeholder="name@work-email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  className={FIELD_CLASS}
                />
                <button
                  type="submit"
                  disabled={!email.trim() || isCheckingEmail}
                  className={SUBMIT_CLASS}
                >
                  {isCheckingEmail ? (
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  ) : (
                    'Enter your work email'
                  )}
                </button>
              </form>
            </motion.div>
          )}

          {step === 'signin' && (
            <motion.div
              key="signin-step"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 px-1">
                <button
                  onClick={goBack}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 hover:bg-foreground/5 rounded-full"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="text-[14px] text-muted-foreground">{email}</span>
              </div>

              <form onSubmit={handleSignIn} className="space-y-3">
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  autoFocus
                  className={FIELD_CLASS}
                />
                <button type="submit" disabled={!password || isLoading} className={SUBMIT_CLASS}>
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Sign in'}
                </button>
              </form>

              <div className="flex items-center justify-between px-1 pt-1">
                <Link
                  href="/forgot-password"
                  className="text-[13px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Forgot password?
                </Link>
                <button
                  onClick={() => {
                    setPassword('')
                    setStep('signup')
                  }}
                  className="text-[13px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  Create account instead <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 'signup' && (
            <motion.div
              key="signup-step"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 px-1">
                <button
                  onClick={goBack}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 hover:bg-foreground/5 rounded-full"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="text-[14px] text-muted-foreground">{email}</span>
              </div>

              <form onSubmit={handleSignUp} className="space-y-3">
                <input
                  type="text"
                  placeholder="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                  autoFocus
                  className={FIELD_CLASS}
                />
                <input
                  type="password"
                  placeholder="Password (min 8 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={FIELD_CLASS}
                />
                <button
                  type="submit"
                  disabled={!fullName || !password || password.length < 8 || isLoading}
                  className={SUBMIT_CLASS}
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Create account'}
                </button>
              </form>

              <div className="px-1 pt-1">
                <button
                  onClick={() => {
                    setPassword('')
                    setFullName('')
                    setStep('signin')
                  }}
                  className="text-[13px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" /> Already have an account? Sign in
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}

/** Legal small print shown under the form. */
export function AuthLegal({ className }: { className?: string }) {
  return (
    <p className={className}>
      By signing up to a free account or Team workspace, you agree to the{' '}
      <Link href="/terms" className="underline hover:text-muted-foreground">MSA</Link>,{' '}
      <Link href="/terms" className="underline hover:text-muted-foreground">Product Terms</Link>,{' '}
      <Link href="/privacy" className="underline hover:text-muted-foreground">Policies</Link>,{' '}
      <Link href="/privacy" className="underline hover:text-muted-foreground">Privacy Notice</Link>, and{' '}
      <Link href="/privacy" className="underline hover:text-muted-foreground">Cookie Notice</Link>.
    </p>
  )
}
