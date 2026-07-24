/**
 * Query Complexity Detector
 * 
 * Analyzes user queries to determine the appropriate Chain of Thought depth.
 * Based on Claude's patterns for adaptive reasoning.
 */

export type ComplexityLevel = 'simple' | 'medium' | 'complex'

export interface ComplexityResult {
  level: ComplexityLevel
  score: number
  reasons: string[]
  shouldShowThinking: boolean
  thinkingDepth: 'minimal' | 'moderate' | 'deep'
  estimatedTokens: number
}

// Keywords that indicate complexity
const COMPLEXITY_INDICATORS = {
  simple: [
    'hi', 'hello', 'hey', 'what is', "what's", 'who is', "who's", 'where is',
    'when is', 'how are you', 'thanks', 'thank you', 'bye', 'goodbye',
    'yes', 'no', 'ok', 'okay', 'sure', 'maybe', 'please', 'help',
    'what time', 'what day', 'today', 'tomorrow', 'weather',
  ],
  complex: [
    'analyze', 'analysis', 'compare', 'comparison', 'design', 'create',
    'build', 'strategy', 'strategic', 'recommend', 'recommendation',
    'evaluate', 'assessment', 'plan', 'framework', 'architecture',
    'optimize', 'optimization', 'research', 'investigate', 'synthesize',
    'comprehensive', 'detailed', 'in-depth', 'thorough', 'complex',
    'multiple', 'various', 'several', 'options', 'alternatives',
    'trade-off', 'pros and cons', 'advantages', 'disadvantages',
    'best practice', 'industry standard', 'benchmark', 'case study',
    'step by step', 'how to', 'tutorial', 'guide', 'explain why',
    'what if', 'scenario', 'hypothetical', 'predict', 'forecast',
    'business plan', 'marketing strategy', 'competitive analysis',
    'market research', 'user research', 'technical specification',
  ],
  medium: [
    'how', 'why', 'explain', 'describe', 'tell me about',
    'what are', 'list', 'examples', 'difference between',
    'vs', 'versus', 'compared to', 'similar to', 'like',
    'meaning', 'definition', 'overview', 'summary',
  ]
}

// Question patterns by complexity
const QUESTION_PATTERNS = {
  // Simple: Direct factual questions with single answers
  simple: [
    /^what\s+(is|are|was|were)\s+\w+/i,
    /^who\s+(is|was)\s+\w+/i,
    /^where\s+(is|are|was|were)\s+\w+/i,
    /^when\s+(is|are|was|were|did|will)\s+\w+/i,
    /^how\s+(many|much|old|long|far)\s+/i,
    /^(can|could|will|would|is|are|do|does|did)\s+/i,
  ],
  // Complex: Multi-part, open-ended, or analytical questions
  complex: [
    /^(how|why)\s+(would|should|could|can)\s+/i,
    /what\s+(would|should|could)\s+.*\s+if/i,
    /compare\s+.*\s+(and|to|with)/i,
    /analyze|evaluate|assess|review/i,
    /design|create|build|develop.*\s+(for|to)/i,
    /best\s+way\s+to|most\s+effective/i,
    /step.?by.?step|walk\s+me\s+through/i,
  ]
}

/**
 * Detect the complexity level of a user query
 */
export function detectComplexity(query: string): ComplexityResult {
  const lowerQuery = query.toLowerCase().trim()
  const wordCount = lowerQuery.split(/\s+/).length
  const sentenceCount = (lowerQuery.match(/[.!?]+/g) || []).length
  
  let score = 0
  const reasons: string[] = []
  
  // Word count analysis
  if (wordCount <= 5) {
    score -= 2
    reasons.push('Very short query')
  } else if (wordCount <= 15) {
    score += 0
    reasons.push('Medium length query')
  } else if (wordCount <= 30) {
    score += 1
    reasons.push('Longer query')
  } else {
    score += 2
    reasons.push('Very detailed query')
  }
  
  // Check for simple keywords
  const hasSimpleKeywords = COMPLEXITY_INDICATORS.simple.some(kw => 
    lowerQuery.includes(kw.toLowerCase())
  )
  if (hasSimpleKeywords && wordCount < 10) {
    score -= 2
    reasons.push('Contains simple greeting/factual keywords')
  }
  
  // Check for complex keywords
  const complexMatches = COMPLEXITY_INDICATORS.complex.filter(kw => 
    lowerQuery.includes(kw.toLowerCase())
  )
  if (complexMatches.length > 0) {
    score += complexMatches.length * 2
    reasons.push(`Contains complex keywords: ${complexMatches.slice(0, 3).join(', ')}`)
  }
  
  // Check for medium keywords
  const mediumMatches = COMPLEXITY_INDICATORS.medium.filter(kw => 
    lowerQuery.includes(kw.toLowerCase())
  )
  if (mediumMatches.length > 0) {
    score += mediumMatches.length
  }
  
  // Check question patterns
  const isSimplePattern = QUESTION_PATTERNS.simple.some(p => p.test(query))
  const isComplexPattern = QUESTION_PATTERNS.complex.some(p => p.test(query))
  
  if (isSimplePattern && !isComplexPattern) {
    score -= 1
    reasons.push('Simple question pattern')
  } else if (isComplexPattern) {
    score += 2
    reasons.push('Complex question pattern')
  }
  
  // Multiple questions indicate complexity
  const questionCount = (query.match(/\?/g) || []).length
  if (questionCount > 1) {
    score += questionCount
    reasons.push(`Multiple questions (${questionCount})`)
  }
  
  // Lists or enumerations
  if (/\d+\)|\*|•|-\s/.test(query) || /\b(first|second|third|finally)\b/i.test(query)) {
    score += 1
    reasons.push('Contains list or enumeration')
  }
  
  // Context-seeking phrases
  if (/\b(context|background|history|previous|earlier|before|above)\b/i.test(query)) {
    score += 1
    reasons.push('References prior context')
  }
  
  // Determine final level
  let level: ComplexityLevel
  if (score <= 0) {
    level = 'simple'
  } else if (score <= 3) {
    level = 'medium'
  } else {
    level = 'complex'
  }
  
  // Determine thinking depth and visibility
  const shouldShowThinking = level !== 'simple' || wordCount > 10
  const thinkingDepth = level === 'simple' ? 'minimal' : level === 'medium' ? 'moderate' : 'deep'
  
  // Estimate thinking tokens needed
  const estimatedTokens = level === 'simple' ? 20 : level === 'medium' ? 100 : 300
  
  return {
    level,
    score,
    reasons,
    shouldShowThinking,
    thinkingDepth,
    estimatedTokens,
  }
}

/**
 * Get progressive loading states based on complexity
 */
export function getProgressiveStates(complexity: ComplexityLevel): string[] {
  switch (complexity) {
    case 'simple':
      return ['Thinking...']
    case 'medium':
      return ['Analyzing...', 'Synthesizing...']
    case 'complex':
      return ['Analyzing request...', 'Planning approach...', 'Researching...', 'Synthesizing response...']
    default:
      return ['Thinking...']
  }
}

/**
 * Get system prompt addition for thinking depth.
 *
 * Uses <thinking> tags so the model's chain-of-thought reasoning is visible
 * in the Thinking UI. This works universally with all models via the gateway.
 * Native thinking blocks (thinking_delta) are also supported as a parallel path.
 */
export function getThinkingInstruction(depth: 'minimal' | 'moderate' | 'deep'): string {
  switch (depth) {
    case 'minimal':
      return `Before responding, briefly reason through what the user needs inside <thinking> tags, then give your response outside them.`
    case 'moderate':
      return `Before responding, reason through the problem inside <thinking> tags. Your thinking should:
1. Identify the user's core intent
2. Consider what information or tools would help
3. Plan a clear, structured response

Then provide your response outside the thinking tags.`
    case 'deep':
      return `Before responding, do thorough analysis inside <thinking> tags:

<thinking>
1. What exactly is the user asking? What are the implicit needs?
2. Break the problem into sub-questions or components
3. Which tools should I use (web_search, analyze_url) and in what order?
4. Consider multiple perspectives, trade-offs, and edge cases
5. How should I structure a comprehensive response?
</thinking>

Then provide a thorough, well-structured response outside the thinking tags.`
  }
}

/**
 * Quick check for simple queries that don't need CoT
 */
export function isSimpleQuery(query: string): boolean {
  const result = detectComplexity(query)
  return result.level === 'simple' && result.score <= -1
}

/**
 * Format complexity for display/logging
 */
export function formatComplexity(result: ComplexityResult): string {
  return `[Complexity: ${result.level.toUpperCase()} | Score: ${result.score} | Tokens: ~${result.estimatedTokens}]`
}