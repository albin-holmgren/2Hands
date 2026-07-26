'use client'

/**
 * The standalone sign-in page.
 *
 * The app itself signs people in through a dialog now (components/v3/auth),
 * but this route still matters: email confirmation and password-recovery links
 * land here, /auth/callback redirects here with ?error= when a provider
 * round-trip fails, and it is the destination for anything that needs a full
 * page rather than an overlay.
 *
 * The form is shared with the dialog — see components/auth/auth-form.tsx.
 */

import { useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

import { Logo } from '@/components/ui/logo'
import { AuthForm, AuthLegal } from '@/components/auth/auth-form'

function SignInContent() {
  const searchParams = useSearchParams()
  const referralCode = searchParams.get('ref')
  const nextParam = searchParams.get('next')
  const errorParam = searchParams.get('error')
  const reportedErrorRef = useRef<string | null>(null)

  // /auth/callback and /auth/confirm redirect here with ?error=… on failure
  // (denied consent, expired link, missing PKCE verifier). Without this the
  // user just sees a fresh sign-in form and no explanation at all.
  useEffect(() => {
    if (!errorParam) return
    if (reportedErrorRef.current === errorParam) return
    reportedErrorRef.current = errorParam
    toast.error(errorParam)
  }, [errorParam])

  return (
    <div className="w-full max-w-[400px] mx-auto text-center">
      {/* Logo — mobile only (desktop left panel shows it) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex justify-center mb-2 lg:hidden"
      >
        <Link href="/" aria-label="2Hands Home">
          <Logo />
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.05 }}
      >
        <h1 className="text-3xl font-bold text-foreground leading-[1.3] mb-3">Welcome back</h1>
        <AuthForm nextPath={nextParam} referralCode={referralCode} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <AuthLegal className="mt-8 text-[11px] text-muted-foreground/60 leading-[1.6]" />
      </motion.div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  )
}
