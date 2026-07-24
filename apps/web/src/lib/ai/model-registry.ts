/**
 * Central Model Registry
 *
 * Single source of truth for every model 2Hands can use via Vercel AI Gateway.
 * Controls routing eligibility, pricing, reasoning support, and margin policy.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReasoningMode =
  | 'native'           // Model emits thinking blocks natively (e.g. Claude extended thinking, Kimi thinking)
  | 'none'             // Model does not expose visible reasoning — do NOT fabricate it

export type ModelPurpose =
  | 'default'          // Cheap base model for most work
  | 'reasoning'        // Strong reasoning / thinking
  | 'deep_reasoning'   // Premium deep analytical reasoning
  | 'search'           // Search-native with citations
  | 'fast'             // Ultra-fast, cheap utility
  | 'coding'           // Strong at code generation
  | 'long_context'     // Very large context window

/** Execution phase a model is eligible for */
export type ModelPhase =
  | 'plan'             // First-run strategic planning, goal-tree generation
  | 'execute'          // Routine step-by-step execution (the workhorse)
  | 'verify'           // Milestone / artifact / action verification
  | 'replan'           // Re-planning after drift or failure
  | 'judge'            // High-stakes strategic judgment / audit
  | 'research'         // Evidence gathering with live web search
  | 'summarize'        // Compression, formatting, handoff notes

export type RoutingSurface =
  | 'chat'             // Manager chat
  | 'agent'            // Agent executor
  | 'mission'          // Mission ticks
  | 'eval'             // Evaluation / testing
  | 'internal'         // Internal helpers (summaries, classifiers, judges)

export interface ModelEntry {
  /** Vercel AI Gateway model ID (provider/model format) */
  id: string
  /** Human-readable label */
  label: string
  /** Provider name */
  provider: string
  /** Purpose tags — used by the router to match task type to model */
  purposes: ModelPurpose[]
  /** Reasoning support */
  reasoning: ReasoningMode
  /** Whether the model supports tool/function calling */
  supportsTools: boolean
  /** Whether the model supports streaming */
  supportsStreaming: boolean
  /** Max context window tokens */
  maxContextTokens: number
  /** Pricing per 1M tokens in USD */
  pricing: {
    inputPer1M: number
    outputPer1M: number
  }
  /** Margin / profitability config */
  margin: {
    /** Minimum multiplier on raw cost to compute credit burn (e.g. 5 = 5× raw cost) */
    multiplier: number
    /** Absolute minimum credits per request regardless of token count */
    floor: number
    /** Maximum credits a single request can burn (safety cap) */
    ceiling: number
  }
  /** Surfaces this model is allowed on */
  allowedSurfaces: RoutingSurface[]
  /** Execution phases this model is eligible for */
  phases: ModelPhase[]
  /** If true, model should only be used for short bounded calls — never long-running loops */
  shortBurstOnly: boolean
  /** Fallback model ID if this model fails */
  fallback: string | null
  /** Whether this model is currently enabled */
  enabled: boolean
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const MODEL_REGISTRY: Record<string, ModelEntry> = {
  // ── 1. Default workhorse (majority of traffic) ─────────────────────────
  'google/gemini-2.5-flash': {
    id: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'google',
    purposes: ['default', 'reasoning', 'fast'],
    reasoning: 'none',
    supportsTools: true,
    supportsStreaming: true,
    maxContextTokens: 1_000_000,
    pricing: { inputPer1M: 0.30, outputPer1M: 2.50 },
    margin: { multiplier: 7, floor: 3, ceiling: 500 },
    allowedSurfaces: ['chat', 'agent', 'mission', 'eval', 'internal'],
    phases: ['plan', 'execute', 'verify', 'replan', 'summarize'],
    shortBurstOnly: false,
    fallback: 'google/gemini-2.5-pro',
    enabled: true,
  },

  'google/gemini-2.5-pro': {
    id: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'google',
    purposes: ['reasoning', 'deep_reasoning', 'coding'],
    reasoning: 'none',
    supportsTools: true,
    supportsStreaming: true,
    maxContextTokens: 1_000_000,
    pricing: { inputPer1M: 1.25, outputPer1M: 10.0 },
    margin: { multiplier: 6, floor: 5, ceiling: 1500 },
    allowedSurfaces: ['chat', 'agent', 'mission', 'eval', 'internal'],
    phases: ['plan', 'execute', 'verify', 'replan', 'judge', 'summarize'],
    shortBurstOnly: false,
    fallback: 'anthropic/claude-3.5-haiku',
    enabled: true,
  },

  // ── 2. Moonshot Kimi (legacy / optional) ──────────────────────────────
  'moonshotai/kimi-k2': {
    id: 'moonshotai/kimi-k2',
    label: 'Kimi K2 (Thinking)',
    provider: 'moonshotai',
    purposes: ['default', 'reasoning'],
    reasoning: 'native',
    supportsTools: true,
    supportsStreaming: true,
    maxContextTokens: 131072,
    pricing: { inputPer1M: 0.60, outputPer1M: 2.40 },
    margin: { multiplier: 8, floor: 3, ceiling: 500 },
    allowedSurfaces: ['chat', 'agent', 'mission', 'eval', 'internal'],
    phases: ['plan', 'execute', 'verify', 'replan', 'summarize'],
    shortBurstOnly: false,
    fallback: 'google/gemini-2.5-flash',
    enabled: true,
  },

  // Keep k2.5 as a fallback / utility option
  'moonshotai/kimi-k2.5': {
    id: 'moonshotai/kimi-k2.5',
    label: 'Kimi K2.5',
    provider: 'moonshotai',
    purposes: ['default', 'fast'],
    reasoning: 'none',
    supportsTools: true,
    supportsStreaming: true,
    maxContextTokens: 131072,
    pricing: { inputPer1M: 1.00, outputPer1M: 4.00 },
    margin: { multiplier: 6, floor: 3, ceiling: 400 },
    allowedSurfaces: ['chat', 'agent', 'mission', 'eval', 'internal'],
    phases: ['execute', 'summarize'],
    shortBurstOnly: false,
    fallback: null,
    enabled: true,
  },

  // ── 3. Fast low-cost utility ─────────────────────────────────────────
  'anthropic/claude-3.5-haiku': {
    id: 'anthropic/claude-3.5-haiku',
    label: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    purposes: ['fast'],
    reasoning: 'none',
    supportsTools: true,
    supportsStreaming: true,
    maxContextTokens: 200000,
    pricing: { inputPer1M: 0.80, outputPer1M: 4.00 },
    margin: { multiplier: 7, floor: 3, ceiling: 400 },
    allowedSurfaces: ['chat', 'agent', 'internal'],
    phases: ['verify', 'summarize'],
    shortBurstOnly: false,
    fallback: 'google/gemini-2.5-flash',
    enabled: true,
  },

  // ── 4. Premium deep reasoning (used sparingly — only truly complex tasks) ──
  'anthropic/claude-sonnet-4.6': {
    id: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    purposes: ['deep_reasoning', 'coding'],
    reasoning: 'native',
    supportsTools: true,
    supportsStreaming: true,
    maxContextTokens: 200000,
    pricing: { inputPer1M: 3.00, outputPer1M: 15.00 },
    margin: { multiplier: 5, floor: 15, ceiling: 2000 },
    allowedSurfaces: ['chat', 'agent', 'mission'],
    phases: ['plan', 'replan', 'judge', 'verify'],
    shortBurstOnly: false,
    fallback: 'google/gemini-2.5-flash',
    enabled: true,
  },

  // ── 5. Search-native research (cheap sonar, not pro) ──────────────────
  'perplexity/sonar': {
    id: 'perplexity/sonar',
    label: 'Perplexity Sonar',
    provider: 'perplexity',
    purposes: ['search'],
    reasoning: 'none',
    supportsTools: false,
    supportsStreaming: true,
    maxContextTokens: 128000,
    pricing: { inputPer1M: 1.00, outputPer1M: 1.00 },
    margin: { multiplier: 6, floor: 5, ceiling: 800 },
    allowedSurfaces: ['chat', 'agent', 'mission'],
    phases: ['research'],
    shortBurstOnly: false,
    fallback: 'google/gemini-2.5-flash',
    enabled: true,
  },

  // ── 6. Strong fallback / broad capability ────────────────────────────
  'openai/gpt-4.1': {
    id: 'openai/gpt-4.1',
    label: 'GPT-4.1',
    provider: 'openai',
    purposes: ['reasoning', 'coding', 'long_context'],
    reasoning: 'none',
    supportsTools: true,
    supportsStreaming: true,
    maxContextTokens: 1048576,
    pricing: { inputPer1M: 2.00, outputPer1M: 8.00 },
    margin: { multiplier: 5, floor: 5, ceiling: 1500 },
    allowedSurfaces: ['chat', 'agent', 'mission'],
    phases: ['execute', 'plan', 'verify'],
    shortBurstOnly: false,
    fallback: 'google/gemini-2.5-flash',
    enabled: true,
  },

  // ── 7. Top-tier strategic planner / judge (SHORT BURST ONLY) ──────────
  // GPT-5.4 is expensive and should NEVER be used for long-running execution,
  // routine chat, browser driving, or repeated background work.
  // It produces: plans, audits, verdicts, adjustments — then hands off to the default workhorse.
  'openai/gpt-5.4': {
    id: 'openai/gpt-5.4',
    label: 'GPT-5.4 (Strategic)',
    provider: 'openai',
    purposes: ['deep_reasoning'],
    reasoning: 'none',
    supportsTools: true,
    supportsStreaming: true,
    maxContextTokens: 128000,
    pricing: { inputPer1M: 10.00, outputPer1M: 30.00 },
    margin: { multiplier: 4, floor: 25, ceiling: 3000 },
    allowedSurfaces: ['mission', 'internal'],
    phases: ['plan', 'judge', 'replan'],
    shortBurstOnly: true,
    fallback: 'anthropic/claude-sonnet-4.6',
    enabled: true,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a model entry by ID, or null if not found / disabled */
export function getModel(id: string): ModelEntry | null {
  const entry = MODEL_REGISTRY[id]
  if (!entry || !entry.enabled) return null
  return entry
}

/** Get the default base model */
export function getDefaultModel(): ModelEntry {
  return MODEL_REGISTRY['google/gemini-2.5-flash']
}

/** Get fallback chain for a model (max 3 hops) */
export function getFallbackChain(id: string): string[] {
  const chain: string[] = []
  let current = id
  for (let i = 0; i < 3; i++) {
    const entry = MODEL_REGISTRY[current]
    if (!entry?.fallback) break
    chain.push(entry.fallback)
    current = entry.fallback
  }
  return chain
}

/** List all enabled models */
export function listEnabledModels(): ModelEntry[] {
  return Object.values(MODEL_REGISTRY).filter(m => m.enabled)
}

/** List models eligible for a specific surface */
export function listModelsForSurface(surface: RoutingSurface): ModelEntry[] {
  return listEnabledModels().filter(m => m.allowedSurfaces.includes(surface))
}

/** List models that match a specific purpose */
export function listModelsForPurpose(purpose: ModelPurpose): ModelEntry[] {
  return listEnabledModels().filter(m => m.purposes.includes(purpose))
}

/** Check if a model supports native reasoning (visible thinking) */
export function supportsNativeReasoning(id: string): boolean {
  const entry = MODEL_REGISTRY[id]
  return entry?.reasoning === 'native'
}

/** List models eligible for a specific execution phase */
export function listModelsForPhase(phase: ModelPhase): ModelEntry[] {
  return listEnabledModels().filter(m => m.phases.includes(phase))
}

/** Get the best model for a given phase + surface combo */
export function getModelForPhase(
  phase: ModelPhase,
  surface: RoutingSurface,
  options?: { needsTools?: boolean; preferCheap?: boolean }
): ModelEntry {
  const candidates = listEnabledModels()
    .filter(m => m.phases.includes(phase) && m.allowedSurfaces.includes(surface))
    .filter(m => !options?.needsTools || m.supportsTools)

  if (candidates.length === 0) return getDefaultModel()

  if (options?.preferCheap) {
    // Sort by output price ascending — pick cheapest eligible
    candidates.sort((a, b) => a.pricing.outputPer1M - b.pricing.outputPer1M)
    return candidates[0]
  }

  // For planning/judging phases, pick the strongest (most expensive) eligible model
  if (phase === 'plan' || phase === 'judge' || phase === 'replan') {
    candidates.sort((a, b) => b.pricing.outputPer1M - a.pricing.outputPer1M)
    return candidates[0]
  }

  // For execute/verify/summarize, pick the cheapest
  candidates.sort((a, b) => a.pricing.outputPer1M - b.pricing.outputPer1M)
  return candidates[0]
}

/** Check if a model is restricted to short-burst use only */
export function isShortBurstOnly(id: string): boolean {
  const entry = MODEL_REGISTRY[id]
  return entry?.shortBurstOnly === true
}
