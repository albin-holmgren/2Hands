'use client'

/**
 * Planning Indicator Component
 * Shows checklist with phases, progress, and time estimates
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ClipboardList, Check, Clock, ArrowRight } from 'lucide-react'
import { STATE_CONFIGS, formatElapsedTime } from '../constants'
import type { PlanningStep } from '../types'

interface PlanningIndicatorProps {
  currentPhase?: number
  totalPhases?: number
  steps?: PlanningStep[]
  estimatedTimeRemaining?: number
}

export function PlanningIndicator({ 
  currentPhase = 1,
  totalPhases = 4,
  steps = [],
  estimatedTimeRemaining
}: PlanningIndicatorProps) {
  const config = STATE_CONFIGS.planning
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Default steps if none provided
  const displaySteps: PlanningStep[] = steps.length > 0 ? steps : [
    { id: '1', label: 'Research competitors', status: 'completed' },
    { id: '2', label: 'Analyze pricing models', status: 'completed' },
    { id: '3', label: 'Draft comparison table', status: 'current' },
    { id: '4', label: 'Generate recommendations', status: 'pending' },
  ]

  return (
    <div className="flex items-start gap-3 py-3 px-0 sm:px-2">
      <div className="flex flex-col gap-2 w-full max-w-md">
        {/* Main indicator card */}
        <div className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-r ${config.gradient} rounded-2xl border ${config.borderColor} backdrop-blur-sm`}>
          {/* Animated clipboard icon */}
          <div className="relative flex-shrink-0">
            <motion.div
              className={`w-10 h-10 rounded-xl bg-background flex items-center justify-center ${config.color}`}
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ClipboardList size={20} />
            </motion.div>
            {/* Wave effect */}
            <motion.div
              className={`absolute -inset-1 rounded-[14px] ${config.color.replace('text-', 'bg-')} opacity-20`}
              animate={{ 
                scale: [1, 1.1, 1],
                opacity: [0.2, 0.3, 0.2]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            />
          </div>

          {/* Text content */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[14px] font-medium ${config.color}`}>
                {config.label}
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                Phase {currentPhase} of {totalPhases}
              </span>
            </div>
            {estimatedTimeRemaining && (
              <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                <Clock size={10} />
                <span>~{formatElapsedTime(estimatedTimeRemaining)} remaining</span>
              </div>
            )}
          </div>
        </div>

        {/* Checklist */}
        <div className="bg-card border border-border rounded-xl p-3 space-y-2">
          {displaySteps.map((step, index) => (
            <motion.div
              key={step.id}
              className="flex items-center gap-2"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              {/* Status icon */}
              <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                step.status === 'completed' 
                  ? 'bg-emerald-500/20 text-emerald-500'
                  : step.status === 'current'
                    ? config.color.replace('text-', 'bg-') + '/20 ' + config.color
                    : 'bg-muted text-muted-foreground'
              }`}>
                {step.status === 'completed' && <Check size={12} />}
                {step.status === 'current' && (
                  <motion.div
                    animate={{ x: [0, 2, 0] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  >
                    <ArrowRight size={12} />
                  </motion.div>
                )}
                {step.status === 'pending' && <div className="w-1.5 h-1.5 rounded-full bg-current" />}
              </div>

              {/* Step label */}
              <span className={`text-[12px] truncate ${
                step.status === 'completed' 
                  ? 'text-muted-foreground line-through'
                  : step.status === 'current'
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground'
              }`}>
                {step.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
