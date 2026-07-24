/**
 * AI State Types
 * Type definitions for AI messaging state indicators
 */

export type AIState =
  | 'thinking'
  | 'browsing'
  | 'searching'
  | 'planning'
  | 'editing'
  | 'working'
  | 'analyzing'
  | 'connecting'
  | 'idle'

export interface AIStateConfig {
  label: string
  icon: string
  color: string
  gradient: string
  borderColor: string
  animation: 'pulse' | 'shimmer' | 'rotate' | 'bounce' | 'wave'
}

export interface AIStateIndicatorProps {
  state: AIState
  context?: string
  progress?: number // 0-100
  metadata?: AIStateMetadata
  startTime?: number // timestamp
  className?: string
}

export interface AIStateMetadata {
  // Thinking
  depth?: 'surface' | 'deep' | 'intensive'
  
  // Browsing
  url?: string
  title?: string
  
  // Searching
  query?: string
  resultsFound?: number
  
  // Planning
  currentPhase?: number
  totalPhases?: number
  steps?: PlanningStep[]
  estimatedTimeRemaining?: number // seconds
  
  // Editing
  documentName?: string
  wordsAdded?: number
  section?: string
  
  // Working
  tasks?: Task[]
  itemsProcessed?: number
  totalItems?: number
  
  // Analyzing
  datasetName?: string
  recordCount?: number
  insightsFound?: number
  
  // Connecting
  serviceName?: string
  serviceIcon?: string
  authStatus?: 'authenticating' | 'connected' | 'fetching'
}

export interface PlanningStep {
  id: string
  label: string
  status: 'pending' | 'current' | 'completed'
}

export interface Task {
  id: string
  label: string
  status: 'pending' | 'active' | 'completed'
}

export interface StateTransition {
  from: AIState
  to: AIState
  timestamp: number
}
