'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setIsValidSession(!!session)
    }
    checkSession()
  }, [supabase.auth])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) {
        toast.error(error.message)
        return
      }

      setIsSuccess(true)
      toast.success('Password updated successfully')
      
      setTimeout(() => {
        router.push('/app')
      }, 2000)
    } catch {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isValidSession === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isValidSession === false) {
    return (
      <div className="w-full">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="mb-8 lg:hidden">
          <Link href="/" aria-label="2Hands Home">
            <Logo />
          </Link>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.1 }} className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-3">Link expired</h1>
          <p className="text-[15px] text-muted-foreground">This password reset link has expired or is invalid</p>
        </motion.div>
        <Link href="/forgot-password">
          <button className="w-full h-[44px] rounded-full bg-foreground text-background font-bold text-[15px] transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black active:scale-[0.98]">
            Request a new link
          </button>
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full">
        {/* Logo — mobile only */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="mb-8 lg:hidden">
          <Link href="/" aria-label="2Hands Home">
            <Logo />
          </Link>
        </motion.div>

        {/* Title */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.1 }} className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-3">
            {isSuccess ? 'Password updated' : 'Set new password'}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {isSuccess ? 'Your password has been successfully updated' : 'Enter your new password below'}
          </p>
        </motion.div>

        {/* Content */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
          {isSuccess ? (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">Redirecting you to the dashboard...</p>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-3">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                  className="w-full h-12 px-6 pr-12 rounded-full border border-border bg-transparent text-foreground text-[15px] font-medium placeholder:text-muted-foreground outline-none focus:border-foreground/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full h-12 px-6 rounded-full border border-border bg-transparent text-foreground text-[15px] font-medium placeholder:text-muted-foreground outline-none focus:border-foreground/20 transition-colors"
              />
              <p className="text-[11px] text-muted-foreground/60 px-2">Password must be at least 8 characters</p>
              <button
                type="submit"
                disabled={!password || !confirmPassword || isLoading}
                className="w-full h-[44px] rounded-full bg-foreground text-background font-bold text-[15px] transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Update password'}
              </button>
            </form>
          )}
        </motion.div>
    </div>
  )
}
