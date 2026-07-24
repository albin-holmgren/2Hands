'use client'

/**
 * Editing Indicator Component
 * Shows document editing with writing animation and progress
 */

import { motion } from 'framer-motion'
import { Pencil, FileText } from 'lucide-react'
import { STATE_CONFIGS } from '../constants'

interface EditingIndicatorProps {
  documentName?: string
  wordsAdded?: number
  section?: string
  progress?: number
}

export function EditingIndicator({ 
  documentName = 'Document',
  wordsAdded = 0,
  section = 'Introduction',
  progress = 45
}: EditingIndicatorProps) {
  const config = STATE_CONFIGS.editing

  return (
    <div className="flex items-start gap-3 py-3 px-0 sm:px-2">
      <div className="flex flex-col gap-2 w-full max-w-md">
        {/* Main indicator card */}
        <div className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-r ${config.gradient} rounded-2xl border ${config.borderColor} backdrop-blur-sm`}>
          {/* Animated pencil icon */}
          <div className="relative flex-shrink-0">
            <motion.div
              className={`w-10 h-10 rounded-xl bg-background flex items-center justify-center ${config.color}`}
              animate={{ 
                rotate: [0, -5, 5, 0],
                scale: [1, 1.05, 1]
              }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Pencil size={20} />
            </motion.div>
            {/* Writing sparkle effect */}
            <motion.div
              className={`absolute -top-1 -right-1 w-3 h-3 ${config.color.replace('text-', 'bg-')} rounded-full`}
              animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
            />
          </div>

          {/* Text content */}
          <div className="flex flex-col flex-1 min-w-0">
            <span className={`text-[14px] font-medium ${config.color}`}>
              {config.label}
            </span>
            <span className="text-[12px] text-muted-foreground truncate">
              {documentName} • {section}
            </span>
          </div>
        </div>

        {/* Editor simulation */}
        <div className="bg-card border border-border rounded-xl p-3">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
            <FileText size={14} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground font-medium truncate">
              {documentName}
            </span>
          </div>

          {/* Writing area */}
          <div className="space-y-1">
            <motion.div
              className="h-2 bg-muted rounded w-full"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5 }}
              style={{ originX: 0 }}
            />
            <motion.div
              className="h-2 bg-muted rounded w-[90%]"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              style={{ originX: 0 }}
            />
            <motion.div
              className="h-2 bg-muted rounded w-[95%]"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              style={{ originX: 0 }}
            />
            <div className="flex items-center gap-1 mt-1">
              <motion.span
                className={`inline-block w-0.5 h-3 ${config.color.replace('text-', 'bg-')}`}
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
            <span className="text-[10px] text-muted-foreground">
              Section: {section}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              +{wordsAdded} words
            </span>
          </div>
        </div>

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
