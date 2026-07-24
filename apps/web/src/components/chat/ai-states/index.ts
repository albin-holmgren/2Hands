/**
 * AI States Module
 * 
 * This module provides rich, animated state indicators for AI activities
 * inspired by Sana Labs' sophisticated visual design.
 * 
 * Usage:
 * ```tsx
 * import { AIStateIndicator } from '@/components/chat/ai-states'
 * 
 * <AIStateIndicator
 *   state="browsing"
 *   context="Extracting design patterns..."
 *   metadata={{ url: "sanalabs.com" }}
 * />
 * ```
 */

// Main orchestrator
export { AIStateIndicator, SimpleLoadingIndicator } from './ai-state-indicator'

// Types
export type {
  AIState,
  AIStateConfig,
  AIStateIndicatorProps,
  AIStateMetadata,
  PlanningStep,
  Task,
  StateTransition,
} from './types'

// Constants
export { STATE_CONFIGS, formatElapsedTime, getProgressColor, ANIMATION_DURATIONS } from './constants'

// Individual indicators (for advanced use cases)
export { ThinkingIndicator } from './indicators/thinking-indicator'
export { BrowsingIndicator } from './indicators/browsing-indicator'
export { SearchingIndicator } from './indicators/searching-indicator'
export { PlanningIndicator } from './indicators/planning-indicator'
export { EditingIndicator } from './indicators/editing-indicator'
export { WorkingIndicator } from './indicators/working-indicator'
export { AnalyzingIndicator } from './indicators/analyzing-indicator'
export { ConnectingIndicator } from './indicators/connecting-indicator'
