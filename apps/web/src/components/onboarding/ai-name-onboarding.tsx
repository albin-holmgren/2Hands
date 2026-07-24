'use client'

import * as React from 'react'
import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { TwoHandsLoader } from '@/components/ui/loader'

export function AiNameOnboarding() {
  const { user, profile } = useAuth()
  const [aiName, setAiName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const supabase = createClient()

  React.useEffect(() => {
    if (profile && !profile.ai_name) {
      setIsOpen(true)
    }
  }, [profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!aiName.trim()) {
      toast.error('Please enter a name for your AI assistant')
      return
    }

    if (!user) return

    setIsLoading(true)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ ai_name: aiName.trim() } as never)
        .eq('id', user.id)

      if (error) {
        toast.error('Failed to save AI name. Please try again.')
        return
      }

      toast.success(`Welcome! Your AI assistant ${aiName} is ready to help.`)
      setIsOpen(false)
      window.location.reload()
    } catch {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const suggestedNames = ['Atlas', 'Nova', 'Echo', 'Sage', 'Aria', 'Orion']

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
                className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[95vw] max-w-[480px] bg-background rounded-[32px] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.4)] z-[101] overflow-hidden border border-border"
              >
                <div className="p-10 space-y-8">
                  <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-[20px] bg-foreground/5 dark:bg-foreground/10 mb-2">
                      <Sparkles className="w-8 h-8 text-foreground" />
                    </div>
                    <div className="space-y-2">
                      <h1 className="font-serif text-3xl text-foreground tracking-tight">
                        Name your AI
                      </h1>
                      <p className="text-[15px] text-muted-foreground leading-relaxed max-w-[320px] mx-auto">
                        Give your AI assistant a personal name. This is how it will introduce itself to you.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={aiName}
                        onChange={(e) => setAiName(e.target.value)}
                        placeholder="Enter a name..."
                        autoFocus
                        disabled={isLoading}
                        className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-[17px] text-center font-medium focus:outline-none focus:ring-2 focus:ring-foreground/10 transition-all shadow-sm text-foreground placeholder:text-muted-foreground/50"
                      />
                      
                      <div className="flex flex-wrap justify-center gap-2">
                        {suggestedNames.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setAiName(name)}
                            disabled={isLoading}
                            className="px-4 py-1.5 rounded-full text-[13px] font-medium bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-all"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading || !aiName.trim()}
                      className="w-full py-4 rounded-2xl text-[15px] font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-[0_4px_12px_-2px_rgba(0,0,0,0.1)] hover:shadow-[0_8_20px_-4px_rgba(0,0,0,0.15)] active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <TwoHandsLoader size="sm" />
                          Saving...
                        </span>
                      ) : (
                        'Continue'
                      )}
                    </button>
                  </form>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
