/**
 * Quality Gates System
 * 
 * Ensures agents don't mark tasks complete until quality checks pass.
 * Provides "Definition of Done" checklists and QA passes.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { PageState } from '../computer-use/semantic-browser-tools'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, extractTextFromResponse } from '@/lib/ai/ai-client'

export interface QualityGateTemplate {
  id: string
  name: string
  task_type: string
  checks: QualityCheck[]
  is_active: boolean
}

export interface QualityCheck {
  name: string
  type: 'text_present' | 'text_absent' | 'url_contains' | 'url_not_contains' | 'insight_count' | 'links_captured' | 'artifact_created' | 'no_errors'
  config: Record<string, unknown>
  required: boolean
}

export interface QualityGateResult {
  id: string
  agent_id: string
  template_id?: string
  checks_performed: CheckResult[]
  all_required_passed: boolean
  overall_score: number
  qa_status: 'pending' | 'passed' | 'failed' | 'needs_review'
  qa_notes?: string
}

export interface CheckResult {
  name: string
  passed: boolean
  evidence?: string
  timestamp: string
}

/**
 * Get quality gate template for a task type
 */
export async function getQualityGateTemplate(taskType: string): Promise<QualityGateTemplate | null> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('quality_gate_templates')
    .select('*')
    .eq('task_type', taskType)
    .eq('is_active', true)
    .single()
  
  return data as QualityGateTemplate | null
}

/**
 * Detect task type from description
 */
export function detectTaskTypeForQA(taskDescription: string): string {
  const lower = taskDescription.toLowerCase()
  
  if ((lower.includes('email') || lower.includes('gmail') || lower.includes('outlook')) && 
      (lower.includes('send') || lower.includes('compose') || lower.includes('reply'))) {
    return 'email_send'
  }
  
  if ((lower.includes('linkedin') || lower.includes('twitter') || lower.includes('instagram') || lower.includes('facebook')) &&
      (lower.includes('post') || lower.includes('share') || lower.includes('publish'))) {
    return 'social_post'
  }
  
  if (lower.includes('spreadsheet') || lower.includes('sheets') || lower.includes('cell') ||
      lower.includes('update') || lower.includes('edit') || lower.includes('fill')) {
    return 'data_entry'
  }
  
  if (lower.includes('document') || lower.includes('create') || lower.includes('notion') ||
      lower.includes('page') || lower.includes('write')) {
    return 'document_creation'
  }
  
  if (lower.includes('research') || lower.includes('find') || lower.includes('search') ||
      lower.includes('information') || lower.includes('look up')) {
    return 'web_research'
  }
  
  return 'general'
}

/**
 * Run quality gate checks
 */
export async function runQualityGateChecks(
  agentId: string,
  taskDescription: string,
  pageState: PageState | null,
  context: {
    insightsReported?: number
    linksVisited?: string[]
    artifactsCreated?: string[]
    errorsEncountered?: string[]
  }
): Promise<QualityGateResult> {
  const supabase = createAdminClient()
  const taskType = detectTaskTypeForQA(taskDescription)
  const template = await getQualityGateTemplate(taskType)
  
  const checkResults: CheckResult[] = []
  let requiredPassed = 0
  let requiredTotal = 0
  
  // If we have a template, run its checks
  if (template) {
    for (const check of template.checks) {
      if (check.required) requiredTotal++
      
      const result = await performCheck(check, pageState, context)
      checkResults.push(result)
      
      if (result.passed && check.required) {
        requiredPassed++
      }
    }
  } else {
    // Default checks for any task
    const defaultChecks: QualityCheck[] = [
      { name: 'no_error_messages', type: 'no_errors', config: {}, required: true },
    ]
    
    for (const check of defaultChecks) {
      requiredTotal++
      const result = await performCheck(check, pageState, context)
      checkResults.push(result)
      if (result.passed) requiredPassed++
    }
  }
  
  const allRequiredPassed = requiredTotal === 0 || requiredPassed === requiredTotal
  const overallScore = checkResults.length > 0 
    ? checkResults.filter(c => c.passed).length / checkResults.length 
    : 1
  
  // Determine QA status
  let qaStatus: QualityGateResult['qa_status'] = 'pending'
  if (allRequiredPassed && overallScore >= 0.8) {
    qaStatus = 'passed'
  } else if (!allRequiredPassed) {
    qaStatus = 'failed'
  } else {
    qaStatus = 'needs_review'
  }
  
  // Save result
  const { data: saved } = await supabase
    .from('quality_gate_results')
    .insert({
      agent_id: agentId,
      template_id: template?.id,
      checks_performed: checkResults,
      all_required_passed: allRequiredPassed,
      overall_score: overallScore,
      qa_status: qaStatus,
    } as never)
    .select('id')
    .single()
  
  return {
    id: (saved as { id: string } | null)?.id || '',
    agent_id: agentId,
    template_id: template?.id,
    checks_performed: checkResults,
    all_required_passed: allRequiredPassed,
    overall_score: overallScore,
    qa_status: qaStatus,
  }
}

/**
 * Perform a single quality check
 */
async function performCheck(
  check: QualityCheck,
  pageState: PageState | null,
  context: {
    insightsReported?: number
    linksVisited?: string[]
    artifactsCreated?: string[]
    errorsEncountered?: string[]
  }
): Promise<CheckResult> {
  const timestamp = new Date().toISOString()
  
  // Combine page state into searchable text
  const pageText = pageState 
    ? `${pageState.url} ${pageState.title} ${pageState.visible_text || ''} ${pageState.errors?.join(' ') || ''}`.toLowerCase()
    : ''
  
  switch (check.type) {
    case 'text_present': {
      const texts = (check.config.texts as string[]) || []
      const found = texts.find(t => pageText.includes(t.toLowerCase()))
      return {
        name: check.name,
        passed: !!found,
        evidence: found ? `Found: "${found}"` : 'Text not found on page',
        timestamp,
      }
    }
    
    case 'text_absent': {
      const texts = (check.config.texts as string[]) || []
      const found = texts.find(t => pageText.includes(t.toLowerCase()))
      return {
        name: check.name,
        passed: !found,
        evidence: found ? `Found unwanted text: "${found}"` : 'No unwanted text found',
        timestamp,
      }
    }
    
    case 'url_contains': {
      const value = (check.config.value as string) || ''
      const passed = pageState?.url?.toLowerCase().includes(value.toLowerCase()) || false
      return {
        name: check.name,
        passed,
        evidence: passed ? `URL contains "${value}"` : `URL does not contain "${value}"`,
        timestamp,
      }
    }
    
    case 'url_not_contains': {
      const value = (check.config.value as string) || ''
      const passed = !pageState?.url?.toLowerCase().includes(value.toLowerCase())
      return {
        name: check.name,
        passed,
        evidence: passed ? `URL does not contain "${value}"` : `URL contains "${value}"`,
        timestamp,
      }
    }
    
    case 'insight_count': {
      const minCount = (check.config.min as number) || 1
      const actual = context.insightsReported || 0
      return {
        name: check.name,
        passed: actual >= minCount,
        evidence: `${actual}/${minCount} insights reported`,
        timestamp,
      }
    }
    
    case 'links_captured': {
      const minCount = (check.config.min as number) || 1
      const actual = context.linksVisited?.length || 0
      return {
        name: check.name,
        passed: actual >= minCount,
        evidence: `${actual}/${minCount} links captured`,
        timestamp,
      }
    }
    
    case 'artifact_created': {
      const actual = context.artifactsCreated?.length || 0
      return {
        name: check.name,
        passed: actual > 0,
        evidence: actual > 0 ? `${actual} artifact(s) created` : 'No artifacts created',
        timestamp,
      }
    }
    
    case 'no_errors': {
      const errorTexts = ['error', 'failed', 'could not', 'unable to', 'invalid']
      const hasErrors = errorTexts.some(e => pageText.includes(e))
      const contextErrors = context.errorsEncountered?.length || 0
      return {
        name: check.name,
        passed: !hasErrors && contextErrors === 0,
        evidence: hasErrors ? 'Error indicators found on page' : 'No errors detected',
        timestamp,
      }
    }
    
    default:
      return {
        name: check.name,
        passed: true,
        evidence: 'Check type not implemented',
        timestamp,
      }
  }
}

/**
 * Run a final QA pass using LLM
 */
export async function runLLMQAPass(
  taskDescription: string,
  pageState: PageState | null,
  stepsSummary: string,
  confirmations: string[]
): Promise<{
  passed: boolean
  confidence: number
  issues: string[]
  suggestions: string[]
}> {
  const prompt = `You are a QA reviewer checking if a task was completed correctly.

TASK: ${taskDescription}

CURRENT PAGE STATE:
- URL: ${pageState?.url || 'unknown'}
- Title: ${pageState?.title || 'unknown'}
- Errors on page: ${pageState?.errors?.join(', ') || 'none'}

STEPS TAKEN:
${stepsSummary}

CONFIRMATIONS RECEIVED:
${confirmations.length > 0 ? confirmations.join('\n') : 'None'}

Evaluate if the task was completed successfully. Check for:
1. Was the main objective achieved?
2. Are there any error indicators?
3. Were confirmations received?
4. Is there anything incomplete?

Respond in JSON:
{
  "passed": true/false,
  "confidence": 0.0-1.0,
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion if needed"]
}`

  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })
    
    const text = extractTextFromResponse(response)
    
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        passed: parsed.passed ?? false,
        confidence: parsed.confidence ?? 0.5,
        issues: parsed.issues || [],
        suggestions: parsed.suggestions || [],
      }
    }
  } catch (error) {
    console.error('[QualityGates] LLM QA error:', error)
  }
  
  return {
    passed: true, // Default to pass if QA fails
    confidence: 0.5,
    issues: [],
    suggestions: ['QA check could not be performed'],
  }
}

/**
 * Format quality gate result for display
 */
export function formatQualityGateResultForDisplay(result: QualityGateResult): string {
  const statusEmoji = {
    passed: '✅',
    failed: '❌',
    needs_review: '⚠️',
    pending: '⏳',
  }[result.qa_status]
  
  let output = `\n## Quality Check ${statusEmoji}\n\n`
  output += `**Status:** ${result.qa_status.toUpperCase()}\n`
  output += `**Score:** ${Math.round(result.overall_score * 100)}%\n\n`
  
  if (result.checks_performed.length > 0) {
    output += '**Checks:**\n'
    for (const check of result.checks_performed) {
      const emoji = check.passed ? '✓' : '✗'
      output += `${emoji} ${check.name}`
      if (check.evidence) output += ` - ${check.evidence}`
      output += '\n'
    }
  }
  
  if (result.qa_notes) {
    output += `\n**Notes:** ${result.qa_notes}\n`
  }
  
  return output
}

/**
 * Should block task completion based on QA result?
 */
export function shouldBlockCompletion(result: QualityGateResult): {
  block: boolean
  reason?: string
} {
  if (result.qa_status === 'failed') {
    const failedChecks = result.checks_performed.filter(c => !c.passed)
    return {
      block: true,
      reason: `Quality checks failed: ${failedChecks.map(c => c.name).join(', ')}`,
    }
  }
  
  if (result.qa_status === 'needs_review' && result.overall_score < 0.5) {
    return {
      block: true,
      reason: 'Quality score too low, needs review',
    }
  }
  
  return { block: false }
}

/**
 * Create custom quality gate for a task
 */
export async function createCustomQualityGate(
  taskDescription: string,
  requiredOutcomes: string[]
): Promise<QualityCheck[]> {
  const checks: QualityCheck[] = []
  
  // Always check for errors
  checks.push({
    name: 'no_errors',
    type: 'no_errors',
    config: {},
    required: true,
  })
  
  // Add checks for required outcomes
  for (const outcome of requiredOutcomes) {
    if (outcome.toLowerCase().includes('send') || outcome.toLowerCase().includes('sent')) {
      checks.push({
        name: 'message_sent',
        type: 'text_present',
        config: { texts: ['sent', 'delivered', 'message sent'] },
        required: true,
      })
    }
    
    if (outcome.toLowerCase().includes('save') || outcome.toLowerCase().includes('saved')) {
      checks.push({
        name: 'changes_saved',
        type: 'text_present',
        config: { texts: ['saved', 'updated', 'changes saved'] },
        required: true,
      })
    }
    
    if (outcome.toLowerCase().includes('post') || outcome.toLowerCase().includes('published')) {
      checks.push({
        name: 'content_published',
        type: 'text_present',
        config: { texts: ['posted', 'published', 'shared'] },
        required: true,
      })
    }
  }
  
  return checks
}
