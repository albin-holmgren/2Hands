'use client'

/**
 * AI State Indicator Orchestrator
 * Main component that renders the appropriate indicator based on AI state
 */

import { motion, AnimatePresence } from 'framer-motion'
import type { AIStateIndicatorProps } from './types'
import { STATE_CONFIGS } from './constants'
import { ThinkingIndicator } from './indicators/thinking-indicator'
import { BrowsingIndicator } from './indicators/browsing-indicator'
import { SearchingIndicator } from './indicators/searching-indicator'
import { PlanningIndicator } from './indicators/planning-indicator'
import { EditingIndicator } from './indicators/editing-indicator'
import { WorkingIndicator } from './indicators/working-indicator'
import { AnalyzingIndicator } from './indicators/analyzing-indicator'
import { ConnectingIndicator } from './indicators/connecting-indicator'

export function AIStateIndicator({
  state,
  context,
  progress,
  metadata,
  startTime,
  className = ''
}: AIStateIndicatorProps) {
  const config = STATE_CONFIGS[state] || STATE_CONFIGS.idle

  const renderIndicator = () => {
    switch (state) {
      case 'thinking':
        return (
          <ThinkingIndicator
            thoughts={context}
            startTime={startTime}
          />
        )

      case 'browsing':
        return (
          <BrowsingIndicator
            url={metadata?.url}
            title={metadata?.title}
            context={context}
          />
        )

      case 'searching':
        return (
          <SearchingIndicator
            query={metadata?.query}
            resultsFound={metadata?.resultsFound}
            context={context}
          />
        )

      case 'planning':
        return (
          <PlanningIndicator
            currentPhase={metadata?.currentPhase}
            totalPhases={metadata?.totalPhases}
            steps={metadata?.steps}
            estimatedTimeRemaining={metadata?.estimatedTimeRemaining}
          />
        )

      case 'editing':
        return (
          <EditingIndicator
            documentName={metadata?.documentName}
            wordsAdded={metadata?.wordsAdded}
            section={metadata?.section}
            progress={progress}
          />
        )

      case 'working':
        return (
          <WorkingIndicator
            tasks={metadata?.tasks}
            itemsProcessed={metadata?.itemsProcessed}
            totalItems={metadata?.totalItems}
            context={context}
          />
        )

      case 'analyzing':
        return (
          <AnalyzingIndicator
            datasetName={metadata?.datasetName}
            recordCount={metadata?.recordCount}
            insightsFound={metadata?.insightsFound}
            context={context}
          />
        )

      case 'connecting':
        return (
          <ConnectingIndicator
            serviceName={metadata?.serviceName}
            serviceIcon={metadata?.serviceIcon}
            authStatus={metadata?.authStatus}
          />
        )

      case 'idle':
      default:
        return null
    }
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className={className}
      >
        {renderIndicator()}
      </motion.div>
    </AnimatePresence>
  )
}

// Simple loading dots for basic loading states
export function SimpleLoadingIndicator({ label = 'Thinking' }: { label?: string }) {
  return (
    <div className="flex items-start gap-3 py-2 px-0 sm:px-2">
      <div className="flex items-center gap-2 px-0 py-1 bg-transparent rounded-2xl">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-1.5 h-1.5 bg-foreground/20 rounded-full"
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.8, 1.1, 0.8]
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut'
              }}
            />
          ))}
        </div>
        <span className="text-[13px] text-muted-foreground font-medium ml-2">{label}...</span>
      </div>
    </div>
  )
}
