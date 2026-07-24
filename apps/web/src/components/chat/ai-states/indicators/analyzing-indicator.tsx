'use client'

/**
 * Analyzing Indicator Component
 * Shows data analysis with dataset info, insights, and mini visualizations
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Sparkles, Database } from 'lucide-react'
import { STATE_CONFIGS } from '../constants'

interface AnalyzingIndicatorProps {
  datasetName?: string
  recordCount?: number
  insightsFound?: number
  context?: string
}

export function AnalyzingIndicator({ 
  datasetName = 'Dataset',
  recordCount = 0,
  insightsFound = 0,
  context = 'Finding patterns...'
}: AnalyzingIndicatorProps) {
  const config = STATE_CONFIGS.analyzing
  const [displayCount, setDisplayCount] = useState(0)
  const [displayInsights, setDisplayInsights] = useState(0)

  // Animate counters
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayCount(prev => {
        if (prev >= recordCount) return recordCount
        return prev + Math.ceil((recordCount - prev) / 10)
      })
    }, 50)
    return () => clearInterval(interval)
  }, [recordCount])

  useEffect(() => {
    if (insightsFound > displayInsights) {
      const timeout = setTimeout(() => {
        setDisplayInsights(insightsFound)
      }, 300)
      return () => clearTimeout(timeout)
    }
  }, [insightsFound, displayInsights])

  return (
    <div className="flex items-start gap-3 py-3 px-0 sm:px-2">
      <div className="flex flex-col gap-2 w-full max-w-md">
        {/* Main indicator card */}
        <div className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-r ${config.gradient} rounded-2xl border ${config.borderColor} backdrop-blur-sm`}>
          {/* Animated chart icon */}
          <div className="relative flex-shrink-0">
            <motion.div
              className={`w-10 h-10 rounded-xl bg-background flex items-center justify-center ${config.color}`}
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <BarChart3 size={20} />
            </motion.div>
            {/* Data flow particles */}
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className={`absolute w-1.5 h-1.5 rounded-full ${config.color.replace('text-', 'bg-')}`}
                style={{ 
                  top: `${20 + i * 15}%`,
                  right: '-4px'
                }}
                animate={{ 
                  x: [-4, 4, -4],
                  opacity: [0.4, 1, 0.4]
                }}
                transition={{ 
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.3,
                  ease: 'easeInOut'
                }}
              />
            ))}
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

        {/* Dataset info */}
        <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-xl border border-border">
          <Database size={14} className="text-muted-foreground flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[12px] text-foreground font-medium truncate">
              {datasetName}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {displayCount.toLocaleString()} records
            </span>
          </div>
        </div>

        {/* Mini chart visualization */}
        <div className="flex items-end gap-1 h-8 px-3 py-2 bg-card rounded-xl border border-border">
          {[40, 65, 45, 80, 55, 70, 50, 85, 60, 75].map((height, i) => (
            <motion.div
              key={i}
              className={`flex-1 rounded-sm ${config.color.replace('text-', 'bg-')} opacity-60`}
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            />
          ))}
        </div>

        {/* Insights counter */}
        {displayInsights > 0 && (
          <motion.div 
            className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Sparkles size={14} className="text-emerald-500" />
            <span className="text-[12px] text-emerald-600 font-medium">
              {displayInsights} insights found
            </span>
          </motion.div>
        )}
      </div>
    </div>
  )
}
