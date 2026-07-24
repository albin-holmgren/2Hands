/**
 * Skill Macros System
 * 
 * Compiles learned patterns into deterministic, reusable playbooks.
 * High-frequency workflows become near-instant and extremely consistent.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, extractTextFromResponse } from '@/lib/ai/ai-client'

export interface SkillMacro {
  id: string
  user_id: string
  name: string
  description: string
  skill_category: string
  trigger_keywords: string[]
  steps: MacroStep[]
  preconditions: MacroCondition[]
  postconditions: MacroCondition[]
  avg_duration_seconds?: number
  success_rate?: number
  times_used: number
  times_succeeded: number
  is_active: boolean
  compiled_from_pattern_id?: string
}

export interface MacroStep {
  order: number
  action: 'click_text' | 'type_into' | 'wait_for_text' | 'key_press' | 'navigate' | 'get_page_state' | 'screenshot'
  target?: string // selector, text, or field name
  value?: string // text to type, URL, etc.
  validation?: MacroCondition // check after this step
  retry_on_fail?: boolean
  max_retries?: number
  wait_before_ms?: number
  description?: string
}

export interface MacroCondition {
  type: 'text_present' | 'text_absent' | 'url_contains' | 'url_not_contains' | 'element_visible' | 'no_errors'
  value: string | string[]
  description?: string
}

export interface MacroExecutionResult {
  success: boolean
  steps_completed: number
  total_steps: number
  failed_at_step?: number
  failure_reason?: string
  duration_ms: number
  validations_passed: number
  validations_failed: number
}

/**
 * Compile a task pattern into a skill macro
 */
export async function compilePatternToMacro(
  userId: string,
  patternId: string
): Promise<SkillMacro | null> {
  const supabase = createAdminClient()
  
  // Get the pattern
  const { data: pattern } = await supabase
    .from('task_execution_patterns')
    .select('*')
    .eq('id', patternId)
    .single()
  
  if (!pattern) return null
  
  const typedPattern = pattern as {
    id: string
    task_type: string
    task_keywords: string[]
    optimal_approach: { step_sequence?: string[] }
    success_tips: string[]
    common_pitfalls: string[]
    confidence_score: number
    avg_duration_seconds?: number
  }
  
  // Only compile high-confidence patterns
  if (typedPattern.confidence_score < 0.6) {
    console.log('[SkillMacros] Pattern confidence too low to compile:', typedPattern.confidence_score)
    return null
  }
  
  // Get recent successful runs for this pattern
  const { data: runs } = await supabase
    .from('execution_run_history')
    .select('steps_taken')
    .eq('pattern_id', patternId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (!runs || runs.length < 2) {
    console.log('[SkillMacros] Not enough successful runs to compile')
    return null
  }
  
  // Analyze common step sequences
  const commonSteps = analyzeCommonSteps(runs.map(r => (r as { steps_taken: unknown[] }).steps_taken))
  
  // Generate macro using LLM
  const macro = await generateMacroFromSteps(
    typedPattern.task_type,
    typedPattern.task_keywords,
    commonSteps,
    typedPattern.success_tips,
    typedPattern.common_pitfalls
  )
  
  if (!macro) return null
  
  // Save macro
  const { data: saved, error } = await supabase
    .from('skill_macros')
    .insert({
      user_id: userId,
      name: macro.name,
      description: macro.description,
      skill_category: typedPattern.task_type,
      trigger_keywords: typedPattern.task_keywords,
      steps: macro.steps,
      preconditions: macro.preconditions,
      postconditions: macro.postconditions,
      avg_duration_seconds: typedPattern.avg_duration_seconds,
      compiled_from_pattern_id: patternId,
      compiled_at: new Date().toISOString(),
    } as never)
    .select('*')
    .single()
  
  if (error) {
    console.error('[SkillMacros] Error saving macro:', error)
    return null
  }
  
  return saved as SkillMacro
}

/**
 * Analyze common steps across multiple runs
 */
function analyzeCommonSteps(allSteps: unknown[][]): { tool: string; input: Record<string, unknown> }[] {
  const commonSteps: { tool: string; input: Record<string, unknown> }[] = []
  
  // Find the most common sequence
  const stepCounts: Record<string, number> = {}
  
  for (const runSteps of allSteps) {
    const typedSteps = runSteps as { tool: string; input: Record<string, unknown>; success: boolean }[]
    
    // Only use successful steps
    const successfulSteps = typedSteps.filter(s => s.success)
    
    for (const step of successfulSteps) {
      const key = `${step.tool}:${JSON.stringify(step.input).slice(0, 50)}`
      stepCounts[key] = (stepCounts[key] || 0) + 1
    }
  }
  
  // Get steps that appear in at least 50% of runs
  const threshold = allSteps.length * 0.5
  const commonKeys = Object.entries(stepCounts)
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
  
  // Reconstruct steps
  for (const [key] of commonKeys.slice(0, 10)) {
    const [tool, inputStr] = key.split(':')
    try {
      const input = JSON.parse(inputStr + '}') // Restore truncated JSON
      commonSteps.push({ tool, input })
    } catch {
      commonSteps.push({ tool, input: {} })
    }
  }
  
  return commonSteps
}

/**
 * Generate macro definition using LLM
 */
async function generateMacroFromSteps(
  taskType: string,
  keywords: string[],
  commonSteps: { tool: string; input: Record<string, unknown> }[],
  successTips: string[],
  pitfalls: string[]
): Promise<{
  name: string
  description: string
  steps: MacroStep[]
  preconditions: MacroCondition[]
  postconditions: MacroCondition[]
} | null> {
  const stepsText = commonSteps
    .map((s, i) => `${i + 1}. ${s.tool}(${JSON.stringify(s.input).slice(0, 100)})`)
    .join('\n')
  
  const prompt = `Create a reusable macro for this task type.

TASK TYPE: ${taskType}
KEYWORDS: ${keywords.join(', ')}

COMMON SUCCESSFUL STEPS:
${stepsText}

SUCCESS TIPS:
${successTips.slice(0, 5).join('\n')}

PITFALLS TO AVOID:
${pitfalls.slice(0, 5).join('\n')}

Create a deterministic macro with:
1. Clear preconditions (what must be true before starting)
2. Step-by-step actions with validations
3. Postconditions (what must be true when done)

Respond in JSON:
{
  "name": "Short descriptive name",
  "description": "What this macro does",
  "steps": [
    {
      "order": 1,
      "action": "click_text|type_into|wait_for_text|key_press|navigate",
      "target": "button text or field name",
      "value": "text to type or URL",
      "validation": {"type": "text_present", "value": "expected text"},
      "retry_on_fail": true,
      "description": "What this step does"
    }
  ],
  "preconditions": [
    {"type": "url_contains", "value": "expected URL part", "description": "Must be on correct page"}
  ],
  "postconditions": [
    {"type": "text_present", "value": "success indicator", "description": "Confirms completion"}
  ]
}`

  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    
    const text = extractTextFromResponse(response)
    
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch (error) {
    console.error('[SkillMacros] Error generating macro:', error)
  }
  
  return null
}

/**
 * Find matching macros for a task
 */
export async function findMatchingMacros(
  userId: string,
  taskDescription: string
): Promise<SkillMacro[]> {
  const supabase = createAdminClient()
  const keywords = extractKeywords(taskDescription)
  
  const { data } = await supabase
    .from('skill_macros')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .overlaps('trigger_keywords', keywords)
    .order('success_rate', { ascending: false })
    .limit(5)
  
  return (data as SkillMacro[]) || []
}

/**
 * Extract keywords from task description
 */
function extractKeywords(taskDescription: string): string[] {
  const keywords: string[] = []
  const lower = taskDescription.toLowerCase()
  
  const actionWords = ['send', 'create', 'update', 'delete', 'post', 'reply', 'compose', 'edit', 'share']
  const serviceWords = ['email', 'gmail', 'linkedin', 'notion', 'slack', 'shopify', 'sheets', 'drive']
  
  for (const word of [...actionWords, ...serviceWords]) {
    if (lower.includes(word)) keywords.push(word)
  }
  
  return keywords
}

/**
 * Execute a macro
 */
export async function executeMacro(
  macro: SkillMacro,
  vmIp: string,
  executeAction: (action: string, params: Record<string, unknown>) => Promise<{ success: boolean; result: string }>
): Promise<MacroExecutionResult> {
  const startTime = Date.now()
  let stepsCompleted = 0
  let validationsPassed = 0
  let validationsFailed = 0
  
  // Check preconditions
  for (const precondition of macro.preconditions) {
    const passed = await checkCondition(precondition, vmIp, executeAction)
    if (!passed) {
      return {
        success: false,
        steps_completed: 0,
        total_steps: macro.steps.length,
        failure_reason: `Precondition failed: ${precondition.description || precondition.value}`,
        duration_ms: Date.now() - startTime,
        validations_passed: 0,
        validations_failed: 1,
      }
    }
  }
  
  // Execute steps
  for (const step of macro.steps.sort((a, b) => a.order - b.order)) {
    // Wait if specified
    if (step.wait_before_ms) {
      await new Promise(resolve => setTimeout(resolve, step.wait_before_ms))
    }
    
    // Execute the action
    let success = false
    let lastError = ''
    const maxRetries = step.retry_on_fail ? (step.max_retries || 3) : 1
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await executeAction(step.action, {
        target: step.target,
        value: step.value,
      })
      
      if (result.success) {
        success = true
        break
      } else {
        lastError = result.result
        // Wait before retry
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    }
    
    if (!success) {
      return {
        success: false,
        steps_completed: stepsCompleted,
        total_steps: macro.steps.length,
        failed_at_step: step.order,
        failure_reason: lastError,
        duration_ms: Date.now() - startTime,
        validations_passed: validationsPassed,
        validations_failed: validationsFailed + 1,
      }
    }
    
    stepsCompleted++
    
    // Check step validation
    if (step.validation) {
      const passed = await checkCondition(step.validation, vmIp, executeAction)
      if (passed) {
        validationsPassed++
      } else {
        validationsFailed++
        // Don't fail on validation, just record
      }
    }
  }
  
  // Check postconditions
  for (const postcondition of macro.postconditions) {
    const passed = await checkCondition(postcondition, vmIp, executeAction)
    if (passed) {
      validationsPassed++
    } else {
      validationsFailed++
    }
  }
  
  return {
    success: true,
    steps_completed: stepsCompleted,
    total_steps: macro.steps.length,
    duration_ms: Date.now() - startTime,
    validations_passed: validationsPassed,
    validations_failed: validationsFailed,
  }
}

/**
 * Check a condition
 */
async function checkCondition(
  condition: MacroCondition,
  vmIp: string,
  executeAction: (action: string, params: Record<string, unknown>) => Promise<{ success: boolean; result: string }>
): Promise<boolean> {
  // Get page state
  const stateResult = await executeAction('get_page_state', {})
  if (!stateResult.success) return false
  
  const state = stateResult.result.toLowerCase()
  const values = Array.isArray(condition.value) ? condition.value : [condition.value]
  
  switch (condition.type) {
    case 'text_present':
      return values.some(v => state.includes(v.toLowerCase()))
    case 'text_absent':
      return values.every(v => !state.includes(v.toLowerCase()))
    case 'url_contains':
      return values.some(v => state.includes(v.toLowerCase()))
    case 'url_not_contains':
      return values.every(v => !state.includes(v.toLowerCase()))
    case 'no_errors':
      return !state.includes('error') && !state.includes('failed')
    default:
      return true
  }
}

/**
 * Update macro statistics after execution
 */
export async function updateMacroStats(
  macroId: string,
  result: MacroExecutionResult
): Promise<void> {
  const supabase = createAdminClient()
  
  const { data: macro } = await supabase
    .from('skill_macros')
    .select('times_used, times_succeeded, avg_duration_seconds')
    .eq('id', macroId)
    .single()
  
  if (!macro) return
  
  const typed = macro as { times_used: number; times_succeeded: number; avg_duration_seconds?: number }
  const newTimesUsed = typed.times_used + 1
  const newTimesSucceeded = result.success ? typed.times_succeeded + 1 : typed.times_succeeded
  const newAvgDuration = typed.avg_duration_seconds
    ? (typed.avg_duration_seconds * typed.times_used + result.duration_ms / 1000) / newTimesUsed
    : result.duration_ms / 1000
  
  await supabase
    .from('skill_macros')
    .update({
      times_used: newTimesUsed,
      times_succeeded: newTimesSucceeded,
      success_rate: newTimesSucceeded / newTimesUsed,
      avg_duration_seconds: newAvgDuration,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', macroId)
}

/**
 * Format macro for agent prompt
 */
export function formatMacroForPrompt(macro: SkillMacro): string {
  let output = `\n## Available Macro: ${macro.name}\n`
  output += `${macro.description}\n\n`
  
  output += `**Success rate:** ${Math.round((macro.success_rate || 0) * 100)}% (${macro.times_used} uses)\n`
  if (macro.avg_duration_seconds) {
    output += `**Typical duration:** ${Math.round(macro.avg_duration_seconds)}s\n`
  }
  output += '\n'
  
  output += '**Steps:**\n'
  for (const step of macro.steps.sort((a, b) => a.order - b.order)) {
    output += `${step.order}. ${step.action}("${step.target || step.value}")`
    if (step.description) output += ` - ${step.description}`
    output += '\n'
  }
  
  output += '\n*To use this macro, follow these exact steps in order.*\n'
  
  return output
}
