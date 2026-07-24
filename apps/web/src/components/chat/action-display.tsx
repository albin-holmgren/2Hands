'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Plus, 
  Trash2, 
  Settings, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  ChevronDown,
  Cpu,
  Wrench
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Action types supported
export type ActionType = 'create' | 'modify' | 'delete' | 'report' | 'configure'

export type ActionStatus = 'active' | 'complete' | 'error' | 'pending'

export interface ActionStep {
  id: string
  type: ActionType
  status: ActionStatus
  label: string
  description?: string
  entityName?: string
  entityType?: 'agent' | 'workflow' | 'integration' | 'setting'
  details?: Record<string, unknown>
  errorMessage?: string
  timestamp?: number
}

interface ActionDisplayProps {
  steps: ActionStep[]
  isExpanded?: boolean
  onToggleExpand?: () => void
}

// Icon mapping for different action types
const actionIcons: Record<ActionType, React.ComponentType<{ className?: string }>> = {
  create: Plus,
  modify: Settings,
  delete: Trash2,
  report: FileText,
  configure: Wrench
}

// Format action type for display
function formatActionType(type: ActionType): string {
  const labels: Record<ActionType, string> = {
    create: 'Creating',
    modify: 'Modifying',
    delete: 'Deleting',
    report: 'Generating',
    configure: 'Configuring'
  }
  return labels[type]
}

// Format entity type for display
function formatEntityType(type?: string): string {
  if (!type) return 'item'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

// Single action step item component - clean neutral styling like ThinkingDisplay
function ActionStepItem({ 
  step, 
  isLast 
}: { 
  step: ActionStep
  isLast: boolean 
}) {
  const Icon = actionIcons[step.type]
  const isComplete = step.status === 'complete'
  const isError = step.status === 'error'
  const isActive = step.status === 'active'
  
  return (
    <div className={cn(
      "flex items-start gap-3 py-2",
      !isLast && "border-b border-border/30"
    )}>
      {/* Status indicator - neutral like ThinkingDisplay */}
      <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-muted/50">
        {isActive && (
          <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
        )}
        {isComplete && (
          <CheckCircle2 className="size-3.5 text-emerald-500" />
        )}
        {isError && (
          <XCircle className="size-3.5 text-red-500" />
        )}
        {!isActive && !isComplete && !isError && (
          <Icon className="size-3.5 text-muted-foreground" />
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {formatActionType(step.type)} {formatEntityType(step.entityType)}
          </span>
          {step.entityName && (
            <span className="text-sm text-muted-foreground truncate">
              "{step.entityName}"
            </span>
          )}
        </div>
        
        {step.description && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {step.description}
          </p>
        )}
        
        {step.errorMessage && isError && (
          <p className="text-xs text-red-500 mt-1">
            {step.errorMessage}
          </p>
        )}
      </div>
    </div>
  )
}

// Main ActionDisplay component - styled like ThinkingDisplay
export function ActionDisplay({ 
  steps, 
  isExpanded: controlledExpanded,
  onToggleExpand
}: ActionDisplayProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isExpanded = controlledExpanded ?? internalExpanded
  const setIsExpanded = onToggleExpand ? () => onToggleExpand() : setInternalExpanded
  
  const contentRef = useRef<HTMLDivElement>(null)
  
  // Auto-expand when there are active steps, collapse when done
  useEffect(() => {
    const hasActive = steps.some(s => s.status === 'active')
    if (hasActive) {
      setInternalExpanded(true)
    } else {
      setInternalExpanded(false)
    }
  }, [steps])
  
  // Get summary text for collapsed state - similar to ThinkingDisplay
  const summary = useMemo(() => {
    const active = steps.find(s => s.status === 'active')
    if (active) {
      return `${formatActionType(active.type)} ${formatEntityType(active.entityType)}${active.entityName ? ` "${active.entityName}"` : ''}...`
    }
    
    const completed = steps.filter(s => s.status === 'complete').length
    const errors = steps.filter(s => s.status === 'error').length
    
    if (errors > 0) {
      return `${completed} completed, ${errors} failed`
    }
    if (completed > 0) {
      return `${completed} action${completed === 1 ? '' : 's'} completed`
    }
    
    return 'Processing...'
  }, [steps])
  
  const hasActive = steps.some(s => s.status === 'active')
  
  if (steps.length === 0) return null
  
  return (
    <motion.div
      className="my-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, overflow: 'hidden' }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Container - matches ThinkingDisplay exactly */}
      <div className="rounded-2xl border border-border/60 bg-[#F5F5F5] dark:bg-[#1E1F20] overflow-hidden relative">
        {/* Subtle gradient shimmer when active - matches ThinkingDisplay */}
        {hasActive && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.03, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
            }}
          />
        )}
        
        {/* Header toggle - matches ThinkingDisplay styling */}
        <motion.button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2.5 w-full px-4 py-3 text-left relative hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors"
          style={{ cursor: 'pointer' }}
          whileHover={{ backgroundColor: 'rgba(0,0,0,0.03)' }}
          whileTap={{ scale: 0.995 }}
        >
          {/* Icon with animation - matches ThinkingDisplay */}
          <motion.div
            animate={hasActive ? { 
              rotate: [0, 10, -10, 0],
              scale: [1, 1.1, 1]
            } : {}}
            transition={{ duration: 1.5, repeat: hasActive ? Infinity : 0, ease: "easeInOut" }}
          >
            <Cpu className="size-4 text-muted-foreground/60 shrink-0" />
          </motion.div>
          
          {/* Title/Summary with AnimatePresence - matches ThinkingDisplay */}
          <AnimatePresence mode="wait">
            {isExpanded ? (
              <motion.span
                key="expanded"
                className="text-sm font-medium text-foreground/80 flex-1"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.15 }}
              >
                Actions
              </motion.span>
            ) : (
              <motion.span
                key="summary"
                className="text-sm text-muted-foreground flex-1 truncate"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
              >
                {summary}
              </motion.span>
            )}
          </AnimatePresence>
          
          {/* Loading dots when active - matches ThinkingDisplay */}
          {hasActive && (
            <span className="flex gap-0.5 shrink-0">
              <motion.span
                className="size-1 bg-muted-foreground rounded-full"
                animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.span
                className="size-1 bg-muted-foreground rounded-full"
                animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
              />
              <motion.span
                className="size-1 bg-muted-foreground rounded-full"
                animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
              />
            </span>
          )}
          
          {/* Chevron */}
          <motion.div
            animate={{ rotate: isExpanded ? 0 : -90 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <ChevronDown className="size-4 text-muted-foreground/50 shrink-0" />
          </motion.div>
        </motion.button>
        
        {/* Expanded content - matches ThinkingDisplay */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-0">
                <motion.div
                  ref={contentRef}
                  className="text-sm leading-relaxed max-h-[300px] overflow-y-auto"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, delay: 0.05 }}
                >
                  <div className="space-y-1">
                    {steps.map((step, index) => (
                      <ActionStepItem
                        key={step.id}
                        step={step}
                        isLast={index === steps.length - 1}
                      />
                    ))}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
