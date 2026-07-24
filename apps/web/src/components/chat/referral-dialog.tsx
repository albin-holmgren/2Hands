'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import { X, Copy, Check, Zap, Gift, MessageCircle, Link as LinkIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ReferralDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ReferralData {
  referralCode: string
  referralUrl: string
  referralCount: number
  totalCreditsEarned: number
  currentCredits: number
}

export function ReferralDialog({ open, onOpenChange }: ReferralDialogProps) {
  const [referralData, setReferralData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      fetchReferralData()
    }
  }, [open])

  const fetchReferralData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/referral')
      if (res.ok) {
        const data = await res.json()
        setReferralData(data)
      }
    } catch (error) {
      console.error('Failed to fetch referral data:', error)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    if (!referralData?.referralUrl) return
    
    try {
      await navigator.clipboard.writeText(referralData.referralUrl)
      setCopied(true)
      toast.success('Link copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[100]"
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[95vw] max-w-[520px] bg-background text-foreground rounded-[24px] shadow-2xl z-[101] overflow-hidden border border-border"
              >
                {/* Header Section */}
                <div className="relative p-8 pt-12">
                  <div className="absolute top-6 left-8">
                    <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted border border-border text-[11px] font-medium text-muted-foreground tracking-tight">
                      Earn 500+ credits
                    </div>
                  </div>
                  
                  <div className="absolute top-6 right-6 z-20">
                    <DialogPrimitive.Close className="w-8 h-8 rounded-full hover:bg-accent flex items-center justify-center transition-colors">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </DialogPrimitive.Close>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="space-y-1">
                      <h2 className="text-[32px] font-bold leading-tight tracking-tight text-foreground">Share the future</h2>
                      <p className="text-[16px] text-muted-foreground">and earn free credits</p>
                    </div>
                    <div className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-br from-pink-500 via-purple-500 to-orange-500 rounded-full blur-3xl opacity-30 group-hover:opacity-40 transition-opacity" />
                      <div className="relative w-24 h-24 bg-card rounded-[32px] flex items-center justify-center border border-border overflow-hidden shadow-2xl">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent" />
                        <svg viewBox="0 0 104 70" className="w-14 h-14" xmlns="http://www.w3.org/2000/svg">
                          <rect x="15" y="17" width="8" height="35" rx="4" fill="#D97757"/>
                          <rect x="27" y="12" width="8" height="35" rx="4" fill="#D97757"/>
                          <rect x="39" y="17" width="8" height="35" rx="4" fill="#D97757"/>
                          <rect x="57" y="17" width="8" height="35" rx="4" fill="#D97757"/>
                          <rect x="69" y="12" width="8" height="35" rx="4" fill="#D97757"/>
                          <rect x="81" y="17" width="8" height="35" rx="4" fill="#D97757"/>
                        </svg>
                        {/* Glossy overlay effect */}
                        <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-br from-white/[0.08] via-transparent to-transparent rotate-45 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-8 pb-10 space-y-8">
                  {/* How it works */}
                  <div className="space-y-5">
                    <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider">How it works:</p>
                    <div className="space-y-5">
                      <div className="flex items-center gap-4 group">
                        <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                          <Zap className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                        <p className="text-[14px] text-foreground font-medium">Share your invite link</p>
                      </div>
                      <div className="flex items-center gap-4 group">
                        <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                          <Gift className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                        <p className="text-[14px] text-foreground">They sign up and get <span className="text-foreground font-semibold underline decoration-border underline-offset-2">extra 500 credits</span></p>
                      </div>
                      <div className="flex items-center gap-4 group">
                        <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                          <MessageCircle className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                        <p className="text-[14px] text-foreground">You get <span className="text-foreground font-semibold underline decoration-border underline-offset-2">500 credits</span> once they create their first agent</p>
                      </div>
                    </div>
                  </div>

                  {/* Stats & Invite Link */}
                  <div className="space-y-4 pt-2">
                    <p className="text-[14px] text-muted-foreground">Your invite link has been used by <span className="text-foreground font-bold">{referralData?.referralCount || 0}</span> users</p>
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 bg-muted border border-border rounded-2xl group focus-within:border-ring focus-within:bg-accent transition-all">
                        <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-[13px] text-foreground break-all select-all">{referralData?.referralUrl || 'Loading...'}</span>
                      </div>
                      <Button
                        onClick={copyToClipboard}
                        className={cn(
                          "w-full h-11 rounded-xl transition-all font-semibold text-[14px] active:scale-[0.98]",
                          copied 
                            ? "bg-green-500/20 text-green-400 border border-green-500/20" 
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                      >
                        {copied ? (
                          <span className="flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            Copied to clipboard
                          </span>
                        ) : 'Copy link'}
                      </Button>
                    </div>
                  </div>

                  <div className="pt-2 text-center">
                    <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors border border-border px-4 py-1.5 rounded-full hover:bg-accent">
                      View Terms and Conditions
                    </button>
                  </div>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

