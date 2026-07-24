'use client'

/**
 * Working Indicator Component
 * Shows general activity with task cards and progress
 */

import { motion } from 'framer-motion'
import { Settings, CheckCircle2, Circle } from 'lucide-react'
import { STATE_CONFIGS } from '../constants'
import type { Task } from '../types'

interface WorkingIndicatorProps {
  tasks?: Task[]
  itemsProcessed?: number
  totalItems?: number
  context?: string
}

export function WorkingIndicator({ 
  tasks = [],
  itemsProcessed = 0,
  totalItems = 100,
  context = 'Processing tasks...'
}: WorkingIndicatorProps) {
  const config = STATE_CONFIGS.working

  // Default tasks if none provided
  const displayTasks: Task[] = tasks.length > 0 ? tasks : [
    { id: '1', label: 'Fetch data', status: 'completed' },
    { id: '2', label: 'Process items', status: 'active' },
    { id: '3', label: 'Generate report', status: 'pending' },
  ]

  const progress = totalItems > 0 ? (itemsProcessed / totalItems) * 100 : 0

  return (
    <div className="flex items-start gap-3 py-3 px-0 sm:px-2">
      <div className="flex flex-col gap-2 w-full max-w-md">
        {/* Main indicator card */}
        <div className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-r ${config.gradient} rounded-2xl border ${config.borderColor} backdrop-blur-sm`}>
          {/* Animated gear icon */}
          <div className="relative flex-shrink-0">
            <motion.div
              className={`w-10 h-10 rounded-xl bg-background flex items-center justify-center ${config.color}`}
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            >
              <Settings size={20} />
            </motion.div>
            {/* Secondary gear */}
            <motion.div
              className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-md bg-background flex items-center justify-center ${config.color}`}
              style={{ fontSize: '10px' }}
              animate={{ rotate: -360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            >
              <Settings size={12} />
            </motion.div>
          </div>

          {/* Text content */}
          <div className="flex flex-col flex-1 min-w-0">
            <span className={`text-[14px] font-medium ${config.color}`}>
              {config.label}
            </span>
            <span className="text-[12px] text-muted-foreground truncate">
              {context}
            </span>
          </div>
        </div>

        {/* Task cards */}
        <div className="grid grid-cols-2 gap-2">
          {displayTasks.slice(0, 4).map((task, index) => (
            <motion.div
              key={task.id}
              className={`p-2 rounded-lg border ${
                task.status === 'active' 
                  ? 'bg-background border-foreground/20' 
                  : 'bg-muted/50 border-transparent'
              }`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className="flex items-center gap-1.5">
                {task.status === 'completed' ? (
                  <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                ) : task.status === 'active' ? (
                  <motion.div
                    className={`w-3 h-3 rounded-full border-2 ${config.color.replace('text-', 'border-')}`}
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                ) : (
                  <Circle size={12} className="text-muted-foreground/50 flex-shrink-0" />
                )}
                <span className={`text-[11px] truncate ${
                  task.status === 'active' ? 'text-foreground font-medium' : 'text-muted-foreground'
                }`}>
                  {task.label}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Progress stats */}
        {totalItems > 0 && (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{itemsProcessed} of {totalItems}</span>
            <span className="font-mono">{Math.round(progress)}%</span>
          </div>
        )}

        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${config.color.replace('text-', 'bg-')}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>
    </div>
  )
}
