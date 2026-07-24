'use client'

/**
 * Searching Indicator Component
 * Shows search query, animated magnifying glass, and result counter
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { STATE_CONFIGS } from '../constants'

interface SearchingIndicatorProps {
  query?: string
  resultsFound?: number
  context?: string
}

export function SearchingIndicator({ 
  query = '', 
  resultsFound = 0,
  context = 'Finding relevant results...'
}: SearchingIndicatorProps) {
  const config = STATE_CONFIGS.searching
  const [displayCount, setDisplayCount] = useState(0)

  // Animate the counter
  useEffect(() => {
    if (resultsFound > displayCount) {
      const interval = setInterval(() => {
        setDisplayCount(prev => {
          if (prev >= resultsFound) {
            clearInterval(interval)
            return resultsFound
          }
          return prev + 1
        })
      }, 50)
      return () => clearInterval(interval)
    }
  }, [resultsFound, displayCount])

  return (
    <div className="flex items-start gap-3 py-3 px-0 sm:px-2">
      <div className="flex flex-col gap-2 w-full max-w-md">
        {/* Main indicator card */}
        <div className={`flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-2xl border ${config.borderColor} backdrop-blur-sm`}>
          {/* Animated search icon */}
          <div className="relative flex-shrink-0">
            <motion.div
              className={`w-10 h-10 rounded-xl bg-secondary flex items-center justify-center ${config.color}`}
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Search size={20} />
            </motion.div>
            {/* Ripple rings */}
            <motion.div
              className={`absolute inset-0 rounded-xl border ${config.borderColor}`}
              animate={{ scale: [1, 1.3, 1.3], opacity: [1, 0.5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
            />
          </div>

          {/* Text content */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[14px] font-medium ${config.color}`}>
                {config.label}
              </span>
              {resultsFound > 0 && (
                <motion.span 
                  className="text-[11px] text-muted-foreground font-mono tabular-nums"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  {displayCount} found
                </motion.span>
              )}
            </div>
            <span className="text-[12px] text-muted-foreground truncate">
              {context}
            </span>
          </div>
        </div>

        {/* Query display */}
        {query && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-xl border border-border">
            <Search size={12} className="text-muted-foreground/50 flex-shrink-0" />
            <span className="text-[12px] text-foreground truncate font-medium">
              "{query}"
            </span>
          </div>
        )}

        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${config.color.replace('text-', 'bg-')}`}
            initial={{ width: 0 }}
            animate={{ width: resultsFound > 0 ? '100%' : ['0%', '60%', '40%', '70%'] }}
            transition={resultsFound > 0 ? { duration: 0.5 } : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </div>
  )
}
