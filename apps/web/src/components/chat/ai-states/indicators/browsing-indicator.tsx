'use client'

/**
 * Browsing Indicator Component
 * Shows browser window with animated URL bar and scanning effect
 */

import { motion } from 'framer-motion'
import { Globe, ArrowRight } from 'lucide-react'
import { STATE_CONFIGS } from '../constants'

interface BrowsingIndicatorProps {
  url?: string
  title?: string
  context?: string
}

export function BrowsingIndicator({ 
  url = 'loading...', 
  title = 'Loading page...',
  context = 'Extracting design patterns...'
}: BrowsingIndicatorProps) {
  const config = STATE_CONFIGS.browsing

  return (
    <div className="flex items-start gap-3 py-3 px-0 sm:px-2">
      <div className="flex flex-col gap-2 w-full max-w-md">
        {/* Main indicator card */}
        <div className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-r ${config.gradient} rounded-2xl border ${config.borderColor} backdrop-blur-sm`}>
          {/* Animated globe icon */}
          <div className="relative flex-shrink-0">
            <motion.div
              className={`w-10 h-10 rounded-xl bg-background flex items-center justify-center ${config.color}`}
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            >
              <Globe size={20} />
            </motion.div>
            {/* Pulsing glow */}
            <motion.div
              className={`absolute -inset-1 rounded-[14px] ${config.color.replace('text-', 'bg-')} opacity-20 blur-sm`}
              animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
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

        {/* Browser window simulation */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          {/* Browser toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-400/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
            </div>
            <div className="flex-1 flex items-center gap-2 mx-2 px-2 py-1 bg-background rounded-md text-[11px] text-muted-foreground">
              <Globe size={10} className={config.color} />
              <motion.span
                className="flex-1 truncate font-mono"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                {url}
              </motion.span>
            </div>
          </div>
          
          {/* Scanning line effect */}
          <div className="relative h-1 bg-muted overflow-hidden">
            <motion.div
              className={`absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-${config.color.split('-')[1]}-500 to-transparent`}
              animate={{ x: ['-100%', '300%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
          </div>

          {/* Page content preview */}
          <div className="px-3 py-2">
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ x: [0, 5, 0] }}
                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ArrowRight size={12} className={config.color} />
              </motion.div>
              <span className="text-[11px] text-muted-foreground truncate">
                {title}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
