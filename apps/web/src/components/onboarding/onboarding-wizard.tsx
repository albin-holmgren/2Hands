'use client'

import { useState, useEffect } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, ArrowRight, ArrowLeft, Sparkles, Zap, Clock, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import type { AgentTemplate } from '@/lib/templates/agent-templates'
import { TwoHandsLoader } from '@/components/ui/loader'

interface OnboardingWizardProps {
  onComplete?: () => void
}

type Step = 'welcome' | 'use_case' | 'pick_template' | 'setup' | 'deploying'

const USE_CASES = [
  { id: 'save_time', icon: '⏰', label: 'Save time on repetitive tasks', description: 'Email, data entry, reports' },
  { id: 'grow_business', icon: '📈', label: 'Grow my business', description: 'Leads, outreach, marketing' },
  { id: 'stay_informed', icon: '📡', label: 'Stay informed', description: 'News, competitors, market trends' },
  { id: 'just_exploring', icon: '🔍', label: 'Just exploring', description: 'See what AI agents can do' },
]

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { user, profile } = useAuth()
  const supabase = createClient()
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<Step>('welcome')
  const [selectedUseCase, setSelectedUseCase] = useState<string | null>(null)
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [userName, setUserName] = useState('')

  // Show wizard for new users who haven't completed onboarding
  useEffect(() => {
    if (profile && !(profile as Record<string, unknown>).onboarding_completed) {
      setIsOpen(true)
    }
  }, [profile])

  // Fetch templates when reaching the pick step
  useEffect(() => {
    if (step === 'pick_template') {
      fetchTemplates()
    }
  }, [step])

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/agents/templates?popular=true')
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
      }
    } catch { /* silent */ }
  }

  const handleDeploy = async () => {
    if (!selectedTemplate || !user) return
    setDeploying(true)
    setStep('deploying')

    try {
      const res = await fetch('/api/agents/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          answers: {},
        }),
      })

      if (res.ok) {
        // Mark onboarding as complete
        await supabase
          .from('profiles')
          .update({
            onboarding_completed: true,
            onboarding_use_case: selectedUseCase,
            display_name: userName || undefined,
          } as never)
          .eq('id', user.id)

        toast.success(`${selectedTemplate.displayName} is ready! Check your agents tab.`)

        setTimeout(() => {
          setIsOpen(false)
          onComplete?.()
        }, 1500)
      } else {
        toast.error('Failed to create agent. You can always create one later from the chat.')
        setStep('pick_template')
      }
    } catch {
      toast.error('Something went wrong. Try creating an agent from the chat.')
      setStep('pick_template')
    } finally {
      setDeploying(false)
    }
  }

  const handleSkip = async () => {
    if (user) {
      await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          display_name: userName || undefined,
        } as never)
        .eq('id', user.id)
    }
    setIsOpen(false)
    onComplete?.()
  }

  const getRecommendedTemplates = () => {
    if (!selectedUseCase) return templates.slice(0, 6)

    const priorityMap: Record<string, string[]> = {
      save_time: ['email-inbox-manager', 'email-support-agent', 'bookkeeper-agent', 'order-processor'],
      grow_business: ['lead-gen-agent', 'outreach-agent', 'social-media-agent', 'crm-updater'],
      stay_informed: ['competitor-monitor', 'news-monitor', 'market-research-agent'],
      just_exploring: ['market-research-agent', 'news-monitor', 'lead-gen-agent'],
    }

    const priorityIds = priorityMap[selectedUseCase] || []
    const prioritized = templates.filter(t => priorityIds.includes(t.id))
    const rest = templates.filter(t => !priorityIds.includes(t.id))
    return [...prioritized, ...rest].slice(0, 6)
  }

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={() => {}}>
      <AnimatePresence>
        {isOpen && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[95vw] max-w-[560px] bg-card rounded-[24px] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.4)] z-[101] overflow-hidden border border-border"
              >
                <AnimatePresence mode="wait">
                  {/* Step 1: Welcome */}
                  {step === 'welcome' && (
                    <motion.div
                      key="welcome"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-8 space-y-6"
                    >
                      <div className="text-center space-y-3">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/50 mb-2">
                          <Sparkles className="w-7 h-7 text-foreground" />
                        </div>
                        <h1 className="text-2xl font-semibold text-foreground">
                          Welcome to 2Hands
                        </h1>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                          Your digital helping hands are ready. Let&apos;s set up your first agent in 60 seconds.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          What should we call you?
                        </label>
                        <input
                          type="text"
                          value={userName}
                          onChange={e => setUserName(e.target.value)}
                          placeholder="Your name"
                          autoFocus
                          className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 text-foreground placeholder:text-muted-foreground/50"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={handleSkip}
                          className="flex-1 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                        >
                          Skip for now
                        </button>
                        <button
                          onClick={() => setStep('use_case')}
                          className="flex-1 py-3 rounded-xl text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                        >
                          Continue
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: Use Case */}
                  {step === 'use_case' && (
                    <motion.div
                      key="use_case"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-8 space-y-6"
                    >
                      <div className="text-center space-y-2">
                        <h2 className="text-xl font-semibold text-foreground">
                          What brings you here?
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          We&apos;ll recommend the perfect first agent for you
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        {USE_CASES.map(uc => (
                          <button
                            key={uc.id}
                            onClick={() => {
                              setSelectedUseCase(uc.id)
                              setStep('pick_template')
                            }}
                            className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all hover:shadow-sm ${
                              selectedUseCase === uc.id
                                ? 'border-foreground bg-accent'
                                : 'border-border hover:border-foreground/30'
                            }`}
                          >
                            <span className="text-2xl">{uc.icon}</span>
                            <div>
                              <div className="text-sm font-medium text-foreground">{uc.label}</div>
                              <div className="text-xs text-muted-foreground">{uc.description}</div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto" />
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => setStep('welcome')}
                        className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Back
                      </button>
                    </motion.div>
                  )}

                  {/* Step 3: Pick Template */}
                  {step === 'pick_template' && (
                    <motion.div
                      key="pick_template"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-8 space-y-5"
                    >
                      <div className="text-center space-y-2">
                        <h2 className="text-xl font-semibold text-foreground">
                          Pick your first agent
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Deploy instantly — you can customize later
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-2 max-h-[320px] overflow-y-auto pr-1">
                        {getRecommendedTemplates().map(t => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTemplate(t)}
                            className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                              selectedTemplate?.id === t.id
                                ? 'border-foreground bg-accent ring-1 ring-ring/20'
                                : 'border-border hover:border-foreground/30'
                            }`}
                          >
                            <span className="text-xl mt-0.5">{t.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground">{t.displayName}</div>
                              <div className="text-xs text-muted-foreground line-clamp-1">{t.shortDescription}</div>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  {t.defaultSchedule.label}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Zap className="w-3 h-3" />
                                  ~{t.estimatedCreditsPerRun} credits/run
                                </span>
                              </div>
                            </div>
                            {selectedTemplate?.id === t.id && (
                              <Check className="w-5 h-5 text-foreground mt-1 flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => setStep('use_case')}
                          className="py-3 px-4 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          Back
                        </button>
                        <button
                          onClick={handleDeploy}
                          disabled={!selectedTemplate}
                          className="flex-1 py-3 rounded-xl text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          <Bot className="w-4 h-4" />
                          Deploy {selectedTemplate?.name || 'Agent'}
                        </button>
                      </div>

                      <button
                        onClick={handleSkip}
                        className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Skip — I&apos;ll create one from the chat
                      </button>
                    </motion.div>
                  )}

                  {/* Step 4: Deploying */}
                  {step === 'deploying' && (
                    <motion.div
                      key="deploying"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-12 text-center space-y-4"
                    >
                      {deploying ? (
                        <>
                          <TwoHandsLoader size="md" />
                          <h2 className="text-lg font-semibold text-foreground">
                            Deploying {selectedTemplate?.displayName}...
                          </h2>
                          <p className="text-sm text-muted-foreground">Setting up your first AI agent</p>
                        </>
                      ) : (
                        <>
                          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                            <Check className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <h2 className="text-lg font-semibold text-foreground">
                            {selectedTemplate?.displayName} is live!
                          </h2>
                          <p className="text-sm text-muted-foreground">Your digital team is growing. Check the agents tab to see it in action.</p>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Progress dots */}
                {step !== 'deploying' && (
                  <div className="flex justify-center gap-1.5 pb-6">
                    {(['welcome', 'use_case', 'pick_template'] as Step[]).map(s => (
                      <div
                        key={s}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          s === step ? 'bg-foreground' : 'bg-muted-foreground/30'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
