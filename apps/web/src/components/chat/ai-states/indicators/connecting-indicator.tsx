'use client'

/**
 * Connecting Indicator Component
 * Shows service connection with auth status and progress
 */

import { motion } from 'framer-motion'
import { Plug, Check, Loader2 } from 'lucide-react'
import { STATE_CONFIGS } from '../constants'

interface ConnectingIndicatorProps {
  serviceName?: string
  serviceIcon?: string
  authStatus?: 'authenticating' | 'connected' | 'fetching'
}

export function ConnectingIndicator({ 
  serviceName = 'Service',
  serviceIcon = '🔌',
  authStatus = 'authenticating'
}: ConnectingIndicatorProps) {
  const config = STATE_CONFIGS.connecting

  const statusSteps = [
    { key: 'authenticating', label: 'Authenticating...', icon: Loader2 },
    { key: 'connected', label: `Connected to ${serviceName}`, icon: Check },
    { key: 'fetching', label: 'Fetching data...', icon: Loader2 },
  ]

  const currentStepIndex = statusSteps.findIndex(s => s.key === authStatus)

  return (
    <div className="flex items-start gap-3 py-3 px-0 sm:px-2">
      <div className="flex flex-col gap-2 w-full max-w-md">
        {/* Main indicator card */}
        <div className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-r ${config.gradient} rounded-2xl border ${config.borderColor} backdrop-blur-sm`}>
          {/* Animated plug icon */}
          <div className="relative flex-shrink-0">
            <motion.div
              className={`w-10 h-10 rounded-xl bg-background flex items-center justify-center ${config.color}`}
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Plug size={20} />
            </motion.div>
            {/* Connection spark */}
            <motion.div
              className={`absolute -top-1 -right-1 w-2 h-2 ${config.color.replace('text-', 'bg-')} rounded-full`}
              animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeOut' }}
            />
          </div>

          {/* Text content */}
          <div className="flex flex-col flex-1 min-w-0">
            <span className={`text-[14px] font-medium ${config.color}`}>
              Connecting to 2Hands
            </span>
            <span className="text-[12px] text-muted-foreground truncate">
              {statusSteps[currentStepIndex]?.label}
            </span>
          </div>
        </div>

        {/* Connection diagram */}
        <div className="flex items-center justify-center gap-4 px-4 py-3 bg-card rounded-xl border border-border">
          {/* 2Hands */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              2
            </div>
            <span className="text-[10px] text-muted-foreground">2Hands</span>
          </div>

          {/* Connection line */}
          <div className="flex flex-col items-center gap-1 flex-1 max-w-[80px]">
            <div className="relative w-full h-1 bg-muted rounded-full overflow-hidden">
              <motion.div
                className={`absolute inset-y-0 ${config.color.replace('text-', 'bg-')}`}
                initial={{ width: '0%' }}
                animate={{ 
                  width: authStatus === 'authenticating' ? '30%' : authStatus === 'connected' ? '100%' : '100%',
                }}
                transition={{ duration: 1 }}
              />
              {authStatus === 'authenticating' && (
                <motion.div
                  className={`absolute inset-y-0 w-1/3 ${config.color.replace('text-', 'bg-')} opacity-50`}
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </div>
            <motion.div
              className={`text-[10px] ${config.color}`}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              {authStatus === 'authenticating' ? 'Connecting...' : authStatus === 'connected' ? 'Connected' : 'Syncing...'}
            </motion.div>
          </div>

          {/* Service */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-lg">
              {serviceIcon}
            </div>
            <span className="text-[10px] text-muted-foreground">{serviceName}</span>
          </div>
        </div>

        {/* Auth steps */}
        <div className="flex gap-2">
          {statusSteps.map((step, index) => {
            const isComplete = index < currentStepIndex
            const isCurrent = index === currentStepIndex
            const StepIcon = step.icon

            return (
              <motion.div
                key={step.key}
                className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] ${
                  isComplete
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : isCurrent
                      ? 'bg-background border border-foreground/20'
                      : 'bg-muted text-muted-foreground'
                }`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
              >
                <StepIcon 
                  size={10} 
                  className={isCurrent ? 'animate-spin' : ''}
                />
                <span className="truncate">{step.label}</span>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
