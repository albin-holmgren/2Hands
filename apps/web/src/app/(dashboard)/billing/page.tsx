'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Sparkles, Zap, Building2, ArrowRight, Info, ShieldCheck, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PRICING } from '@/lib/stripe/config'
import { FadeIn, ScaleIn, StaggerContainer, StaggerItem, HoverLift, RevealText, PremiumPulse, Shimmer } from '@/components/animations'
import { useAuth } from '@/hooks/use-auth'

type BillingInterval = 'monthly' | 'yearly'

export default function PricingPage() {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly')
  const [loading, setLoading] = useState<string | null>(null)
  const { profile } = useAuth()
  const isFree = !profile?.plan_type || profile.plan_type === 'free'

  const handleSubscribe = async (plan: string) => {
    setLoading(plan)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceType: 'subscription',
          plan,
          interval: billingInterval,
        }),
      })

      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Checkout error:', error)
    } finally {
      setLoading(null)
    }
  }

  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      icon: Zap,
      description: 'For individuals getting started',
      monthlyPrice: 25,
      yearlyPrice: 250,
      credits: PRICING.subscriptions.starter.tiers[0].credits,
      agents: PRICING.subscriptions.starter.agents,
      features: PRICING.subscriptions.starter.features,
      popular: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      icon: Sparkles,
      description: 'For power users and small teams',
      monthlyPrice: 49,
      yearlyPrice: 490,
      credits: PRICING.subscriptions.pro.tiers[0].credits,
      agents: PRICING.subscriptions.pro.agents,
      features: PRICING.subscriptions.pro.features,
      popular: true,
    },
    {
      id: 'business',
      name: 'Business',
      icon: Building2,
      description: 'For growing teams',
      monthlyPrice: 149,
      yearlyPrice: 1490,
      credits: PRICING.subscriptions.business.tiers[0].credits,
      agents: PRICING.subscriptions.business.agents,
      features: PRICING.subscriptions.business.features,
      popular: false,
    },
  ]

  const packs = [
    { id: 'small', name: 'Small', credits: 2500, price: 10 },
    { id: 'medium', name: 'Medium', credits: 7500, price: 25, bestValue: true },
    { id: 'large', name: 'Large', credits: 20000, price: 60 },
    { id: 'xlarge', name: 'XL', credits: 45000, price: 120 },
  ]

  const handleBuyCredits = async (packType: string) => {
    setLoading(packType)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceType: 'credits',
          packType,
        }),
      })

      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Checkout error:', error)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-primary/[0.02] blur-[100px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-16">
          <FadeIn>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif text-foreground tracking-tight mb-6">
              <RevealText text="Simple, transparent pricing" />
            </h1>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Scale with plans designed for every stage of growth.
              Clear costs, no hidden fees, pure efficiency.
            </p>
          </FadeIn>
        </div>

        {/* Billing Toggle */}
        <FadeIn delay={0.3}>
          <div className="flex justify-center mb-16">
            <div className="relative flex items-center p-1 rounded-full bg-sidebar border border-border">
              <div 
                className={cn(
                  "absolute h-[calc(100%-8px)] rounded-full bg-card shadow-sm transition-all duration-300 ease-out",
                  billingInterval === 'monthly' ? "w-[100px] left-1" : "w-[120px] left-[105px]"
                )}
              />
              <button
                onClick={() => setBillingInterval('monthly')}
                className={cn(
                  'relative z-10 px-6 py-2 text-sm font-medium transition-colors w-[100px]',
                  billingInterval === 'monthly' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval('yearly')}
                className={cn(
                  'relative z-10 px-6 py-2 text-sm font-medium transition-colors w-[120px] flex items-center justify-center gap-2',
                  billingInterval === 'yearly' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Yearly
                <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">
                  -20%
                </span>
              </button>
            </div>
          </div>
        </FadeIn>

        {/* Pricing Cards */}
        <StaggerContainer className="grid md:grid-cols-3 gap-8 mb-24">
          {plans.map((plan, index) => (
            <StaggerItem key={plan.id} className="h-full">
              <HoverLift>
                <div
                  className={cn(
                    'relative h-full rounded-[32px] border bg-card p-8 flex flex-col transition-all duration-500',
                    plan.popular
                      ? 'border-primary/20 shadow-[0px_24px_48px_rgba(0,0,0,0.06)] dark:shadow-[0px_24px_48px_rgba(0,0,0,0.4)]'
                      : 'border-border shadow-[0px_8px_24px_rgba(0,0,0,0.02)]'
                  )}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
                      <PremiumPulse color="var(--primary)">
                        <div className="bg-primary text-primary-foreground text-[11px] font-bold tracking-widest uppercase px-4 py-1.5 rounded-full">
                          Most Popular
                        </div>
                      </PremiumPulse>
                    </div>
                  )}

                  <div className="mb-8">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={cn(
                        'w-12 h-12 rounded-2xl flex items-center justify-center transition-colors',
                        plan.popular ? 'bg-primary text-primary-foreground' : 'bg-sidebar text-muted-foreground'
                      )}>
                        <plan.icon size={24} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-serif font-medium text-foreground">{plan.name}</h3>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{plan.description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mb-8">
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-bold tracking-tight text-foreground">
                        ${billingInterval === 'monthly' ? plan.monthlyPrice : Math.round(plan.yearlyPrice / 12)}
                      </span>
                      <span className="text-muted-foreground font-medium">/mo</span>
                    </div>
                    {billingInterval === 'yearly' && (
                      <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-2 flex items-center gap-1"
                      >
                        <ShieldCheck size={12} />
                        Billed annually (${plan.yearlyPrice}/yr)
                      </motion.p>
                    )}
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="p-5 rounded-[20px] bg-sidebar/50 border border-border/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground font-medium">Monthly Fuel</span>
                        <Info size={14} className="text-muted-foreground/50 cursor-help" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-foreground">
                          {plan.credits.toLocaleString()}
                        </span>
                        <span className="text-sm text-muted-foreground font-medium">credits</span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Active Agents</span>
                        <span className="text-sm font-bold text-foreground">{plan.agents}</span>
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-4 mb-10 flex-1">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3 group">
                        <div className="mt-1 w-5 h-5 rounded-full bg-primary/5 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                          <Check size={12} className="text-primary" />
                        </div>
                        <span className="text-[14px] text-foreground/80 leading-snug group-hover:text-foreground transition-colors">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loading !== null}
                    className={cn(
                      'w-full h-14 rounded-2xl text-[16px] font-semibold transition-all duration-300 relative overflow-hidden group',
                      plan.popular 
                        ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/10' 
                        : 'bg-transparent border-2 border-border hover:bg-sidebar text-foreground hover:border-foreground/10'
                    )}
                  >
                    {plan.popular && <Shimmer className="absolute inset-0 pointer-events-none opacity-20"><div /></Shimmer>}
                    {loading === plan.id ? (
                      <div className="flex items-center gap-3 relative z-10">
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <span>Processing</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 relative z-10">
                        <span>{plan.id === 'business' ? 'Contact Sales' : 'Select Plan'}</span>
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    )}
                  </Button>
                </div>
              </HoverLift>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Credit Packs Section */}
        <div className="mt-32 pt-24 border-t border-border">
          <div className="text-center mb-16">
            <FadeIn>
              <h2 className="text-3xl sm:text-4xl font-serif font-medium text-foreground mb-4">
                Need extra fuel?
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
                {isFree
                  ? 'Credit packs are available on paid plans. Upgrade to unlock one-time top-ups that never expire.'
                  : 'Top up your credits anytime. One-time purchases that never expire, giving your agents the power they need for peak performance.'}
              </p>
            </FadeIn>
          </div>

          {isFree ? (
            <FadeIn delay={0.2}>
              <div className="max-w-sm mx-auto text-center rounded-[24px] border border-border bg-card p-10 flex flex-col items-center gap-4">
                <Lock size={32} className="text-muted-foreground" strokeWidth={1.5} />
                <p className="text-[15px] text-muted-foreground">
                  Upgrade to a paid plan to unlock credit packs and auto-refill.
                </p>
                <Button
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="mt-2"
                >
                  View Plans
                </Button>
              </div>
            </FadeIn>
          ) : (
          <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {packs.map((pack) => (
              <StaggerItem key={pack.id}>
                <HoverLift>
                  <div
                    className={cn(
                      'relative rounded-[24px] border bg-card p-8 text-center transition-all duration-300',
                      pack.bestValue 
                        ? 'border-primary shadow-[0px_16px_32px_rgba(0,0,0,0.04)]' 
                        : 'border-border shadow-sm'
                    )}
                  >
                    {pack.bestValue && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                        <div className="bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                          Best Value
                        </div>
                      </div>
                    )}

                    <div className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-4">
                      {pack.name} Pack
                    </div>
                    
                    <div className="text-2xl font-bold text-foreground mb-1">
                      {pack.credits.toLocaleString()} 
                    </div>
                    <div className="text-xs text-muted-foreground font-medium mb-6">
                      Credits
                    </div>

                    <div className="text-4xl font-bold text-foreground mb-6">
                      ${pack.price}
                    </div>

                    <Button
                      onClick={() => handleBuyCredits(pack.id)}
                      disabled={loading !== null}
                      variant={pack.bestValue ? 'default' : 'outline'}
                      className={cn(
                        'w-full h-12 rounded-xl text-sm font-bold transition-all',
                        pack.bestValue && 'shadow-md shadow-primary/5'
                      )}
                    >
                      {loading === pack.id ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto" />
                      ) : (
                        'Purchase Fuel'
                      )}
                    </Button>
                  </div>
                </HoverLift>
              </StaggerItem>
            ))}
          </StaggerContainer>
          )}
        </div>

        {/* Footer info */}
        <FadeIn delay={0.7}>
          <div className="mt-24 text-center pb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sidebar border border-border text-[13px] text-muted-foreground mb-8">
              <ShieldCheck size={14} className="text-emerald-500" />
              Secure payments handled by Stripe
            </div>
            <p className="text-[14px] text-muted-foreground">
              Custom requirements? <a href="mailto:enterprise@2hands.ai" className="text-foreground font-medium hover:underline">Talk to our enterprise team</a>
            </p>
          </div>
        </FadeIn>
      </div>
    </div>
  )
}
