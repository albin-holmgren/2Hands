'use client'

import * as React from 'react'
import { useState, useRef, useEffect } from 'react'
import { 
  X,
  Check,
  RefreshCw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { 
  PRICING,
  ROLLOVER_CAP_MULTIPLIER,
  type SubscriptionPlanType,
  type CreditTierKey,
  type CreditTier,
  type BillingInterval,
} from '@/lib/stripe/config'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/hooks/use-auth'
import { useWorkspaceStore } from '@/store/workspace-store'
import { toast } from 'sonner'

interface PricingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Animated number component for price display
function AnimatedNumber({ value, prefix = '' }: { value: number; prefix?: string }) {
  const [displayValue, setDisplayValue] = useState(value)
  
  React.useEffect(() => {
    const duration = 500
    const startTime = Date.now()
    const startValue = displayValue
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(startValue + (value - startValue) * easeOut)
      setDisplayValue(current)
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    
    requestAnimationFrame(animate)
  }, [value])
  
  return (
    <span className="font-semibold tabular-nums tracking-tight">
      {prefix}{displayValue.toLocaleString()}
    </span>
  )
}

const PLAN_KEYS: SubscriptionPlanType[] = ['starter', 'pro', 'business']

export function PricingDialog({ open, onOpenChange }: PricingDialogProps) {
  const { profile } = useAuth()
  const { activeWorkspace } = useWorkspaceStore()
  const topUpRef = useRef<HTMLDivElement>(null)
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly')
  const [loading, setLoading] = useState<string | null>(null)
  const [selectedCreditAmount, setSelectedCreditAmount] = useState(100)
  const [isCustomAmount, setIsCustomAmount] = useState(false)

  // Auto-refill state
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(false)
  const [autoRefillThreshold, setAutoRefillThreshold] = useState(100)
  const [autoRefillAmount, setAutoRefillAmount] = useState(5000)
  const [savingRefill, setSavingRefill] = useState(false)

  // Load auto-refill settings when dialog opens
  useEffect(() => {
    if (!open) return
    fetch('/api/credits/auto-refill')
      .then(r => r.json())
      .then(data => {
        if (data.auto_refill_enabled !== undefined) {
          setAutoRefillEnabled(data.auto_refill_enabled)
          setAutoRefillThreshold(data.auto_refill_threshold)
          setAutoRefillAmount(data.auto_refill_amount)
        }
      })
      .catch(() => {})
  }, [open])

  // Per-plan selected tier keys
  const [selectedTiers, setSelectedTiers] = useState<Record<SubscriptionPlanType, CreditTierKey>>({
    starter: 't1',
    pro: 't1',
    business: 't1',
  })

  const setTier = (plan: SubscriptionPlanType, tierKey: CreditTierKey) => {
    setSelectedTiers(prev => ({ ...prev, [plan]: tierKey }))
  }

  const getSelectedTier = (plan: SubscriptionPlanType): CreditTier => {
    const config = PRICING.subscriptions[plan]
    const tierKey = selectedTiers[plan]
    return config.tiers.find(t => t.key === tierKey) || config.tiers[0]
  }

  // Derived values — prefer workspace credits (workspace-scoped), fall back to profile
  const planType = (activeWorkspace as unknown as { plan?: string } | null)?.plan || profile?.plan_type || 'free'
  const credits = activeWorkspace?.credits ?? profile?.credits ?? 0
  const monthlyCredits = profile?.monthly_credits ?? 0
  const isFree = planType === 'free'
  const dailyAllowance = PRICING.free.dailyCredits // 300
  const rolloverMax = monthlyCredits > 0 ? monthlyCredits * ROLLOVER_CAP_MULTIPLIER : 0
  const totalAllowance = isFree
    ? dailyAllowance
    : monthlyCredits || (PRICING.subscriptions[planType as SubscriptionPlanType]?.tiers[0]?.credits ?? 0)
  const creditPercent = totalAllowance > 0 ? Math.min(100, Math.round((credits / totalAllowance) * 100)) : 0
  const allowanceLabel = isFree ? 'daily' : 'monthly'

  const planLabel = isFree ? 'Free' : PRICING.subscriptions[planType as SubscriptionPlanType]?.name ?? 'Free'

  // Compute renewal date from billing_period_start
  const renewalDateStr = (() => {
    const bps = profile?.billing_period_start
    if (!bps) return null
    const d = new Date(bps)
    d.setMonth(d.getMonth() + 1)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  })()

  const handleSubscribe = async (plan: SubscriptionPlanType) => {
    setLoading(plan)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceType: 'subscription',
          plan,
          interval: billingInterval,
          tierKey: selectedTiers[plan],
        }),
      })
      const data = await response.json()
      if (data.url) window.location.href = data.url
      else if (data.error) toast.error(data.error)
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error('Failed to start checkout. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const handleBuyCredits = async () => {
    setLoading('credits')
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceType: 'credits',
          packType: 'custom',
          customAmount: selectedCreditAmount * 250,
        }),
      })
      const data = await response.json()
      if (data.url) window.location.href = data.url
      else if (data.error) toast.error(data.error)
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error('Failed to start checkout. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const handleManage = async () => {
    setLoading('manage')
    try {
      const response = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await response.json()
      if (data.url) window.location.href = data.url
      else if (data.error) toast.error(data.error)
    } catch (error) {
      console.error('Portal error:', error)
      toast.error('Failed to open billing portal. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const handleSaveAutoRefill = async (enabled: boolean, threshold?: number, amount?: number) => {
    // Free users can't enable auto-refill — nudge them to upgrade
    if (enabled && isFree) {
      toast.error('Upgrade to a paid plan to enable auto-refill')
      return
    }
    setSavingRefill(true)
    try {
      const res = await fetch('/api/credits/auto-refill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          threshold: threshold ?? autoRefillThreshold,
          amount: amount ?? autoRefillAmount,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setAutoRefillEnabled(enabled)
        toast.success(enabled ? 'Auto-refill enabled' : 'Auto-refill disabled')
      } else {
        toast.error(data.error || 'Failed to save')
      }
    } catch {
      toast.error('Failed to save auto-refill settings')
    } finally {
      setSavingRefill(false)
    }
  }

  const scrollToTopUp = () => {
    topUpRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[8px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 transition-all duration-300"
            />
            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 20 }}
                transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                className="fixed inset-0 md:inset-auto md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%] w-full md:w-[95vw] md:max-w-[960px] h-full md:h-auto md:max-h-[92vh] z-[101] flex flex-col"
              >
                {/* Rounded container with gradient background */}
                <div className="w-full h-full md:rounded-3xl overflow-hidden flex flex-col bg-gradient-to-b from-background via-background to-muted/20 border border-border/60 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)]">
                {/* Close button */}
                <DialogPrimitive.Close className="absolute top-5 right-5 z-20 flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors">
                  <X size={18} className="text-muted-foreground" />
                </DialogPrimitive.Close>

                {/* Content */}
                <div className="flex-1 overflow-y-auto md:rounded-3xl">
                  {/* Header section */}
                  <div className="px-4 sm:px-6 md:px-8 pt-8 md:pt-10 pb-4 md:pb-6 text-center">
                    <h2 className="text-[24px] md:text-[28px] font-semibold text-foreground tracking-[-0.02em] mb-1">
                      Plans & credits
                    </h2>
                    <p className="text-[13px] md:text-[14px] text-muted-foreground px-2">
                      Select a plan and credit tier that fits your needs.
                    </p>

                    {/* Billing toggle */}
                    <div className="flex items-center justify-center mt-5">
                      <div className="inline-flex rounded-[10px] border border-border bg-muted/50 p-1">
                        <button
                          onClick={() => setBillingInterval('monthly')}
                          className={cn(
                            'px-4 py-1.5 text-[13px] font-medium transition-all duration-200 rounded-[8px]',
                            billingInterval === 'monthly' 
                              ? 'bg-background text-foreground shadow-sm' 
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          Monthly
                        </button>
                        <button
                          onClick={() => setBillingInterval('yearly')}
                          className={cn(
                            'px-4 py-1.5 text-[13px] font-medium transition-all duration-200 rounded-[8px] flex items-center gap-1.5',
                            billingInterval === 'yearly' 
                              ? 'bg-background text-foreground shadow-sm' 
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          Yearly
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                            -17%
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Current plan summary - unified card - v2 */}
                  <div className="px-4 sm:px-6 md:px-8 pb-4 md:pb-6">
                    <div className="rounded-[12px] md:rounded-[16px] border border-border bg-muted/40 p-4 md:p-5">
                      <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                        {/* Plan info */}
                        <div className="shrink-0">
                          <p className="text-[14px] md:text-[15px] font-semibold text-foreground">
                            {planLabel} Plan
                          </p>
                          <p className="text-[11px] md:text-[12px] text-muted-foreground">
                            {renewalDateStr ? `Renews ${renewalDateStr}` : planType === 'free' ? 'Free tier' : 'Active'}
                          </p>
                          {planType !== 'free' && (
                            <button
                              onClick={handleManage}
                              disabled={loading === 'manage'}
                              className="mt-2 h-7 px-3 rounded-[8px] border border-border bg-background text-[12px] font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                            >
                              {loading === 'manage' ? '...' : 'Manage'}
                            </button>
                          )}
                        </div>

                        {/* Divider */}
                        <div className="hidden md:block h-8 w-px bg-border" />

                        {/* Credits section */}
                        <div className="flex-1 min-w-0 pt-2 md:pt-0 border-t md:border-t-0 border-border mt-2 md:mt-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[12px] md:text-[13px] font-medium text-foreground">Credits</span>
                            <span className="text-[12px] md:text-[13px] text-muted-foreground">
                              {credits.toLocaleString()} of {totalAllowance.toLocaleString()} {allowanceLabel}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-2">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                creditPercent < 15 ? 'bg-red-500' : creditPercent < 40 ? 'bg-amber-500' : 'bg-primary'
                              )}
                              style={{ width: `${Math.max(1, creditPercent)}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-3 text-[11px] md:text-[12px] text-muted-foreground">
                            {isFree && <span>Resets daily</span>}
                            {!isFree && rolloverMax > 0 && <span>Up to {rolloverMax.toLocaleString()} rollover</span>}
                            {!isFree && rolloverMax > 0 && renewalDateStr && <span className="hidden sm:inline">•</span>}
                            {!isFree && renewalDateStr && <span>Reset {renewalDateStr}</span>}
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>

                  {/* Plans grid */}
                  <div className="px-4 sm:px-6 md:px-8 pb-6 md:pb-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {PLAN_KEYS.map((planKey) => {
                        const config = PRICING.subscriptions[planKey]
                        const tier = getSelectedTier(planKey)
                        const price = billingInterval === 'monthly' 
                          ? tier.monthlyPrice 
                          : Math.round(tier.yearlyPrice / 12)
                        const yearlyTotal = tier.yearlyPrice

                        return (
                          <div
                            key={planKey}
                            className={cn(
                              'relative flex flex-col rounded-[16px] md:rounded-[24px] border p-4 md:p-6 pb-6 md:pb-8 transition-all duration-300 ease-out',
                              'hover:shadow-lg hover:-translate-y-0.5',
                              config.popular
                                ? 'border-primary/40 bg-gradient-to-b from-primary/[0.03] to-primary/[0.01] shadow-[0_0_40px_-12px_rgba(59,130,246,0.15)] hover:shadow-[0_0_50px_-8px_rgba(59,130,246,0.25)]'
                                : 'border-border bg-card hover:border-border/80 hover:bg-muted/30'
                            )}
                          >
                            {/* Popular badge with shimmer */}
                            {config.popular && (
                              <div className="absolute -top-3 left-4 md:left-6">
                                <span className="inline-flex items-center px-2.5 md:px-3 py-1 rounded-full bg-gradient-to-r from-primary to-primary/90 text-primary-foreground text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.05em] shadow-lg shadow-primary/25">
                                  Most popular
                                </span>
                              </div>
                            )}

                            {/* Plan name & description */}
                            <div className="mb-3 md:mb-4">
                              <h3 className="text-[18px] md:text-[20px] font-medium text-foreground tracking-[-0.01em]">
                                {config.name}
                              </h3>
                              <p className="text-[12px] md:text-[13px] text-muted-foreground mt-1 md:mt-1.5 leading-relaxed min-h-[36px] md:min-h-[44px]">
                                {config.description}
                              </p>
                            </div>

                            {/* Price block */}
                            <div className="mb-3 md:mb-4">
                              <div className="flex items-baseline gap-2 min-h-[36px] md:min-h-[44px]">
                                <span className="text-[28px] md:text-[32px] font-medium text-foreground tabular-nums tracking-tight">
                                  $<AnimatedNumber value={Math.round(price / 100)} />
                                </span>
                                <span className="text-[13px] md:text-[14px] text-muted-foreground">
                                  per month
                                  <span className="hidden sm:inline ml-1 text-[10px] md:text-[11px] text-muted-foreground/70 align-text-bottom">incl. VAT</span>
                                </span>
                              </div>
                              <p className="text-[12px] md:text-[13px] text-muted-foreground mt-1">
                                Up to {config.agents} agents
                              </p>
                            </div>

                            {/* CTA + Credits section - stacked vertically */}
                            <div className="flex flex-col gap-2 mb-3 md:mb-4 min-h-[72px] md:min-h-[80px]">
                              {/* CTA Button */}
                              <button
                                onClick={() => handleSubscribe(planKey)}
                                disabled={loading !== null || planType === planKey}
                                className={cn(
                                  'h-8 md:h-9 w-full rounded-md text-[12px] md:text-[13px] font-medium transition-all duration-200 flex items-center justify-center border active:scale-[0.98]',
                                  planType === planKey
                                    ? 'bg-muted text-muted-foreground border-border cursor-default'
                                    : config.popular
                                      ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_20px_-4px_rgba(59,130,246,0.3)] hover:shadow-[0_0_24px_-2px_rgba(59,130,246,0.4)] hover:scale-[1.02]'
                                      : 'bg-background text-foreground border-border hover:bg-muted/50 hover:scale-[1.01]'
                                )}
                              >
                                {loading === planKey ? 'Processing...' : planType === planKey ? 'Current plan' : 'Upgrade'}
                              </button>

                              {/* Credits dropdown */}
                              <Select
                                value={selectedTiers[planKey]}
                                onValueChange={(val) => setTier(planKey, val as CreditTierKey)}
                              >
                                <SelectTrigger className="h-8 md:h-9 w-full rounded-md text-[12px] md:text-[13px] border-border bg-background">
                                  <SelectValue placeholder="Select credits" />
                                </SelectTrigger>
                                <SelectContent className="z-[200]">
                                  {config.tiers.map((t) => (
                                    <SelectItem key={t.key} value={t.key} className="text-[12px] md:text-[13px]">
                                      {t.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Features */}
                            <div className="flex flex-col gap-2 md:gap-3 flex-1">
                              <p className="text-[12px] md:text-[13px] text-foreground font-medium">
                                Includes:
                              </p>
                              <ul className="flex flex-col gap-2 md:gap-3">
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-primary mt-0.5 shrink-0" strokeWidth={2} />
                                  <span className="text-[12px] md:text-[13px] text-foreground leading-[18px]">
                                    {tier.credits.toLocaleString()} monthly credits
                                  </span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-primary mt-0.5 shrink-0" strokeWidth={2} />
                                  <span className="text-[12px] md:text-[13px] text-foreground leading-[18px]">
                                    Up to {config.agents} agents
                                  </span>
                                </li>
                                {config.features.map((f, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <Check size={14} className="text-primary mt-0.5 shrink-0" strokeWidth={2} />
                                    <span className="text-[12px] md:text-[13px] text-foreground leading-[18px]">
                                      {f}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Top up credits section — paid plans only */}
                    {!isFree ? (
                    <div ref={topUpRef} className="mt-6 rounded-[12px] md:rounded-[16px] border border-border bg-card p-4 md:p-6">
                      <div className="flex flex-col gap-4">
                        <div>
                          <h3 className="text-[14px] md:text-[16px] font-semibold text-foreground tracking-[-0.01em]">
                            Need more credits?
                          </h3>
                          <p className="text-[12px] md:text-[13px] text-muted-foreground mt-0.5">
                            Top up anytime with a one-time purchase. $1 = 250 credits.
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                          {/* Preset amounts - scrollable on mobile */}
                          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1 sm:mx-0 sm:px-0">
                            {[20, 50, 100].map((amt) => (
                              <button
                                key={amt}
                                onClick={() => { setSelectedCreditAmount(amt); setIsCustomAmount(false) }}
                                className={cn(
                                  'h-9 px-4 rounded-[8px] text-[13px] font-medium border transition-all duration-200 shrink-0',
                                  selectedCreditAmount === amt && !isCustomAmount
                                    ? 'border-primary/40 bg-primary/5 text-foreground'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                )}
                              >
                                ${amt}
                              </button>
                            ))}

                            {/* Custom input */}
                            <div className="relative shrink-0">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground font-medium">$</span>
                              <input
                                type="number"
                                min="5"
                                max="10000"
                                value={isCustomAmount ? selectedCreditAmount : ''}
                                placeholder="Custom"
                                onFocus={() => setIsCustomAmount(true)}
                                onChange={(e) => {
                                  setIsCustomAmount(true)
                                  setSelectedCreditAmount(parseInt(e.target.value) || 0)
                                }}
                                className="h-9 w-24 pl-7 pr-3 rounded-[8px] border border-border bg-background text-[13px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/60"
                              />
                            </div>
                          </div>

                          {/* Buy button */}
                          <button
                            onClick={handleBuyCredits}
                            disabled={loading !== null || selectedCreditAmount < 5}
                            className="h-9 px-5 rounded-[10px] bg-primary text-primary-foreground text-[13px] font-medium shadow-[0_0_16px_-4px_rgba(59,130,246,0.3)] hover:shadow-[0_0_20px_-2px_rgba(59,130,246,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 shrink-0"
                          >
                            {loading === 'credits' ? 'Processing...' : `Buy $${selectedCreditAmount} → ${(selectedCreditAmount * 250).toLocaleString()} credits`}
                          </button>
                        </div>
                      </div>
                    </div>
                    ) : (
                    <div ref={topUpRef} className="mt-6 rounded-[12px] md:rounded-[16px] border border-border bg-card p-4 md:p-6">
                      <div className="flex flex-col gap-2">
                        <h3 className="text-[14px] md:text-[16px] font-semibold text-foreground tracking-[-0.01em]">
                          Want more credits?
                        </h3>
                        <p className="text-[12px] md:text-[13px] text-muted-foreground">
                          Upgrade to a paid plan to top up with one-time credit purchases and enable auto-refill.
                        </p>
                      </div>
                    </div>
                    )}

                    {/* Auto-refill section — paid plans only */}
                    {!isFree && (
                    <div className="mt-4 rounded-[12px] md:rounded-[16px] border border-border bg-card p-4 md:p-6">
                      <div className="flex flex-row items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 md:gap-2.5 mb-1">
                            <span className="hidden md:block"><RefreshCw size={16} className="text-muted-foreground" strokeWidth={1.5} /></span>
                            <span className="md:hidden"><RefreshCw size={14} className="text-muted-foreground" strokeWidth={1.5} /></span>
                            <h3 className="text-[14px] md:text-[15px] font-semibold text-foreground tracking-[-0.01em]">
                              Auto-refill credits
                            </h3>
                          </div>
                          <p className="text-[12px] md:text-[13px] text-muted-foreground">
                            Automatically top up when your balance drops below a threshold. Requires a payment method on file.
                          </p>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          <Switch
                            checked={autoRefillEnabled}
                            onCheckedChange={(checked) => handleSaveAutoRefill(checked)}
                            disabled={savingRefill}
                          />
                        </div>
                      </div>

                      {/* Settings — only shown when enabled */}
                      {autoRefillEnabled && (
                        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
                          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                            <div className="flex-1">
                              <label className="text-[11px] md:text-[12px] font-medium text-muted-foreground uppercase tracking-[0.04em] mb-1.5 block">
                                When balance drops below
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={10}
                                  max={100000}
                                  value={autoRefillThreshold}
                                  onChange={(e) => setAutoRefillThreshold(parseInt(e.target.value) || 100)}
                                  className="h-9 w-full sm:w-32 px-3 rounded-[8px] border border-border bg-background text-[13px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                                />
                                <span className="text-[13px] text-muted-foreground shrink-0">credits</span>
                              </div>
                            </div>
                            <div className="flex-1">
                              <label className="text-[11px] md:text-[12px] font-medium text-muted-foreground uppercase tracking-[0.04em] mb-1.5 block">
                                Add this many credits
                              </label>
                              <div className="flex items-center gap-2">
                                <Select
                                  value={String(autoRefillAmount)}
                                  onValueChange={(val) => setAutoRefillAmount(parseInt(val))}
                                >
                                  <SelectTrigger className="h-9 w-full sm:w-40 rounded-[8px] text-[13px] border-border bg-background">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="z-[200]">
                                    {[2500, 5000, 10000, 25000, 50000].map((amt) => (
                                      <SelectItem key={amt} value={String(amt)} className="text-[13px]">
                                        {amt.toLocaleString()} credits (${(amt / 250).toFixed(0)})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="flex items-end">
                              <button
                                onClick={() => handleSaveAutoRefill(true, autoRefillThreshold, autoRefillAmount)}
                                disabled={savingRefill}
                                className="h-9 px-4 rounded-[8px] bg-primary text-primary-foreground text-[13px] font-medium shadow-[0_0_12px_-4px_rgba(59,130,246,0.25)] hover:shadow-[0_0_16px_-2px_rgba(59,130,246,0.35)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 w-full sm:w-auto"
                              >
                                {savingRefill ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
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
