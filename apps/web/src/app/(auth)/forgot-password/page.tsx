'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Mail, CheckCircle } from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const supabase = createClient()

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      setIsSubmitted(true)
      toast.success('Check your email for the reset link')
    } catch {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full">
        {/* Logo — mobile only */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 lg:hidden"
        >
          <Link href="/" aria-label="2Hands Home">
            <Logo />
          </Link>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-foreground mb-3">
            {isSubmitted ? 'Check your email' : 'Reset your password'}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {isSubmitted
              ? 'We sent a password reset link to your email'
              : 'Enter your email and we\'ll send you a reset link'
            }
          </p>
        </motion.div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {isSubmitted ? (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              </div>
              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  We sent an email to <span className="font-medium text-foreground">{email}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Click the link in the email to reset your password. If you don&apos;t see it, check your spam folder.
                </p>
              </div>
              <button
                onClick={() => { setIsSubmitted(false); setEmail('') }}
                className="w-full h-[44px] rounded-full border border-border bg-card hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-foreground font-medium text-[15px] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Mail className="h-4 w-4" />
                Try a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-3">
              <input
                type="email"
                placeholder="name@work-email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className="w-full h-12 px-6 rounded-full border border-border bg-transparent text-foreground text-[15px] font-medium placeholder:text-muted-foreground outline-none focus:border-foreground/20 transition-colors"
              />
              <button
                type="submit"
                disabled={!email.trim() || isLoading}
                className="w-full h-[44px] rounded-full bg-foreground text-background font-bold text-[15px] transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Send reset link'}
              </button>
            </form>
          )}
        </motion.div>

        {/* Back link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-8 text-center"
        >
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </motion.div>
    </div>
  )
}
