/**
 * Evidence Bundle System
 * 
 * Creates proof-grade deliverables that show exactly what the agent did.
 * Makes outputs feel "world-class" with before/after states, receipts, and summaries.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, extractTextFromResponse } from '@/lib/ai/ai-client'

export interface EvidenceBundle {
  id: string
  agent_id: string
  user_id: string
  task_description: string
  
  // Before state
  before_url?: string
  before_page_title?: string
  before_screenshot_url?: string
  before_state: Record<string, unknown>
  
  // After state
  after_url?: string
  after_page_title?: string
  after_screenshot_url?: string
  after_state: Record<string, unknown>
  
  // Artifacts
  artifacts: Artifact[]
  
  // Confirmations
  confirmations: Confirmation[]
  
  // Links
  links_visited: string[]
  links_created: string[]
  
  // Step receipts
  step_receipts: StepReceipt[]
  
  // Summary
  executive_summary?: string
  key_outcomes: string[]
  next_steps: string[]
  
  // Quality
  evidence_quality_score?: number
  
  started_at: string
  completed_at?: string
}

export interface Artifact {
  type: 'document' | 'spreadsheet' | 'email' | 'post' | 'file' | 'page' | 'order' | 'other'
  name: string
  url?: string
  description: string
  created_at: string
}

export interface Confirmation {
  signal: string
  timestamp: string
  screenshot_url?: string
  context?: string
}

export interface StepReceipt {
  step: number
  action: string
  tool: string
  result: string
  success: boolean
  screenshot_url?: string
  timestamp: string
}

export interface PageState {
  url: string
  title: string
  visible_text?: string
  forms?: string[]
  buttons?: string[]
  errors?: string[]
}

/**
 * Create a new evidence bundle for an agent run
 */
export async function createEvidenceBundle(
  agentId: string,
  userId: string,
  taskDescription: string,
  beforeState?: PageState
): Promise<string> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('evidence_bundles')
    .insert({
      agent_id: agentId,
      user_id: userId,
      task_description: taskDescription,
      before_url: beforeState?.url,
      before_page_title: beforeState?.title,
      before_state: beforeState || {},
      artifacts: [],
      confirmations: [],
      links_visited: [],
      links_created: [],
      step_receipts: [],
      key_outcomes: [],
      next_steps: [],
    } as never)
    .select('id')
    .single()
  
  if (error) {
    console.error('[EvidenceBundle] Error creating bundle:', error)
    return ''
  }
  
  return (data as { id: string })?.id || ''
}

/**
 * Record a step receipt
 */
export async function recordStepReceipt(
  bundleId: string,
  step: number,
  action: string,
  tool: string,
  result: string,
  success: boolean,
  screenshotUrl?: string
): Promise<void> {
  if (!bundleId) return
  
  const supabase = createAdminClient()
  
  const { data: bundle } = await supabase
    .from('evidence_bundles')
    .select('step_receipts')
    .eq('id', bundleId)
    .single()
  
  if (!bundle) return
  
  const receipts = ((bundle as { step_receipts: StepReceipt[] }).step_receipts || []) as StepReceipt[]
  receipts.push({
    step,
    action,
    tool,
    result: result.slice(0, 500),
    success,
    screenshot_url: screenshotUrl,
    timestamp: new Date().toISOString(),
  })
  
  await supabase
    .from('evidence_bundles')
    .update({ step_receipts: receipts } as never)
    .eq('id', bundleId)
}

/**
 * Record a confirmation signal
 */
export async function recordConfirmation(
  bundleId: string,
  signal: string,
  context?: string,
  screenshotUrl?: string
): Promise<void> {
  if (!bundleId) return
  
  const supabase = createAdminClient()
  
  const { data: bundle } = await supabase
    .from('evidence_bundles')
    .select('confirmations')
    .eq('id', bundleId)
    .single()
  
  if (!bundle) return
  
  const confirmations = ((bundle as { confirmations: Confirmation[] }).confirmations || []) as Confirmation[]
  confirmations.push({
    signal,
    timestamp: new Date().toISOString(),
    screenshot_url: screenshotUrl,
    context,
  })
  
  await supabase
    .from('evidence_bundles')
    .update({ confirmations: confirmations } as never)
    .eq('id', bundleId)
}

/**
 * Record an artifact created/modified
 */
export async function recordArtifact(
  bundleId: string,
  artifact: Omit<Artifact, 'created_at'>
): Promise<void> {
  if (!bundleId) return
  
  const supabase = createAdminClient()
  
  const { data: bundle } = await supabase
    .from('evidence_bundles')
    .select('artifacts')
    .eq('id', bundleId)
    .single()
  
  if (!bundle) return
  
  const artifacts = ((bundle as { artifacts: Artifact[] }).artifacts || []) as Artifact[]
  artifacts.push({
    ...artifact,
    created_at: new Date().toISOString(),
  })
  
  await supabase
    .from('evidence_bundles')
    .update({ artifacts: artifacts } as never)
    .eq('id', bundleId)
}

/**
 * Record a link visited
 */
export async function recordLinkVisited(bundleId: string, url: string): Promise<void> {
  if (!bundleId || !url) return
  
  const supabase = createAdminClient()
  
  const { data: bundle } = await supabase
    .from('evidence_bundles')
    .select('links_visited')
    .eq('id', bundleId)
    .single()
  
  if (!bundle) return
  
  const links = ((bundle as { links_visited: string[] }).links_visited || []) as string[]
  if (!links.includes(url)) {
    links.push(url)
    await supabase
      .from('evidence_bundles')
      .update({ links_visited: links } as never)
      .eq('id', bundleId)
  }
}

/**
 * Finalize the evidence bundle with after state and summary
 */
export async function finalizeEvidenceBundle(
  bundleId: string,
  afterState: PageState,
  taskDescription: string
): Promise<EvidenceBundle | null> {
  if (!bundleId) return null
  
  const supabase = createAdminClient()
  
  // Get current bundle
  const { data: bundle } = await supabase
    .from('evidence_bundles')
    .select('*')
    .eq('id', bundleId)
    .single()
  
  if (!bundle) return null
  
  const typedBundle = bundle as EvidenceBundle
  
  // Generate executive summary
  const summary = await generateExecutiveSummary(
    taskDescription,
    typedBundle.step_receipts || [],
    typedBundle.artifacts || [],
    typedBundle.confirmations || []
  )
  
  // Calculate evidence quality score
  const qualityScore = calculateEvidenceQuality(typedBundle)
  
  // Update bundle
  await supabase
    .from('evidence_bundles')
    .update({
      after_url: afterState.url,
      after_page_title: afterState.title,
      after_state: afterState,
      completed_at: new Date().toISOString(),
      executive_summary: summary.summary,
      key_outcomes: summary.outcomes,
      next_steps: summary.nextSteps,
      evidence_quality_score: qualityScore,
    } as never)
    .eq('id', bundleId)
  
  // Return updated bundle
  const { data: finalBundle } = await supabase
    .from('evidence_bundles')
    .select('*')
    .eq('id', bundleId)
    .single()
  
  return (finalBundle as unknown) as EvidenceBundle | null
}

/**
 * Generate executive summary using LLM
 */
async function generateExecutiveSummary(
  taskDescription: string,
  stepReceipts: StepReceipt[],
  artifacts: Artifact[],
  confirmations: Confirmation[]
): Promise<{ summary: string; outcomes: string[]; nextSteps: string[] }> {
  const stepsText = stepReceipts
    .map(s => `${s.step}. ${s.action} → ${s.success ? '✓' : '✗'} ${s.result.slice(0, 100)}`)
    .join('\n')
  
  const artifactsText = artifacts
    .map(a => `- ${a.type}: ${a.name}${a.url ? ` (${a.url})` : ''}`)
    .join('\n')
  
  const confirmationsText = confirmations
    .map(c => `- "${c.signal}"`)
    .join('\n')
  
  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Write a brief executive summary of this completed task, like a senior employee reporting to their manager.

TASK: ${taskDescription}

STEPS TAKEN:
${stepsText || 'No detailed steps recorded'}

ARTIFACTS CREATED:
${artifactsText || 'None'}

CONFIRMATIONS RECEIVED:
${confirmationsText || 'None'}

Respond in JSON:
{
  "summary": "2-3 sentence summary of what was accomplished",
  "outcomes": ["key outcome 1", "key outcome 2"],
  "next_steps": ["recommended follow-up 1"] // optional, only if relevant
}`
      }],
    })
    
    const text = extractTextFromResponse(response)
    
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        summary: parsed.summary || 'Task completed.',
        outcomes: parsed.outcomes || [],
        nextSteps: parsed.next_steps || [],
      }
    }
  } catch (error) {
    console.error('[EvidenceBundle] Error generating summary:', error)
  }
  
  return {
    summary: `Completed task: ${taskDescription.slice(0, 100)}`,
    outcomes: confirmations.map(c => c.signal),
    nextSteps: [],
  }
}

/**
 * Calculate evidence quality score
 */
function calculateEvidenceQuality(bundle: EvidenceBundle): number {
  let score = 0
  const weights = {
    hasBeforeState: 0.1,
    hasAfterState: 0.1,
    hasStepReceipts: 0.2,
    hasConfirmations: 0.25,
    hasArtifacts: 0.15,
    hasLinksVisited: 0.1,
    completedSuccessfully: 0.1,
  }
  
  if (bundle.before_url || bundle.before_state) score += weights.hasBeforeState
  if (bundle.after_url || bundle.after_state) score += weights.hasAfterState
  if (bundle.step_receipts?.length > 0) score += weights.hasStepReceipts
  if (bundle.confirmations?.length > 0) score += weights.hasConfirmations
  if (bundle.artifacts?.length > 0) score += weights.hasArtifacts
  if (bundle.links_visited?.length > 0) score += weights.hasLinksVisited
  if (bundle.completed_at) score += weights.completedSuccessfully
  
  return Math.min(1, score)
}

/**
 * Format evidence bundle for user display
 */
export function formatEvidenceBundleForDisplay(bundle: EvidenceBundle): string {
  let output = '## Task Completion Report\n\n'
  
  // Executive summary
  if (bundle.executive_summary) {
    output += `### Summary\n${bundle.executive_summary}\n\n`
  }
  
  // Key outcomes
  if (bundle.key_outcomes?.length > 0) {
    output += '### Key Outcomes\n'
    for (const outcome of bundle.key_outcomes) {
      output += `✓ ${outcome}\n`
    }
    output += '\n'
  }
  
  // Confirmations received
  if (bundle.confirmations?.length > 0) {
    output += '### Confirmations\n'
    for (const conf of bundle.confirmations) {
      output += `✓ "${conf.signal}"${conf.context ? ` (${conf.context})` : ''}\n`
    }
    output += '\n'
  }
  
  // Artifacts created
  if (bundle.artifacts?.length > 0) {
    output += '### Artifacts Created\n'
    for (const artifact of bundle.artifacts) {
      output += `- **${artifact.type}**: ${artifact.name}`
      if (artifact.url) output += ` ([link](${artifact.url}))`
      output += '\n'
    }
    output += '\n'
  }
  
  // Links visited
  if (bundle.links_visited?.length > 0) {
    output += `### Links Visited\n`
    output += `${bundle.links_visited.length} pages visited during task\n\n`
  }
  
  // Next steps
  if (bundle.next_steps?.length > 0) {
    output += '### Recommended Next Steps\n'
    for (const step of bundle.next_steps) {
      output += `→ ${step}\n`
    }
    output += '\n'
  }
  
  // Quality indicator
  const qualityEmoji = bundle.evidence_quality_score && bundle.evidence_quality_score > 0.7 ? '🟢' : 
    bundle.evidence_quality_score && bundle.evidence_quality_score > 0.4 ? '🟡' : '🔴'
  output += `\n*Evidence quality: ${qualityEmoji} ${Math.round((bundle.evidence_quality_score || 0) * 100)}%*\n`
  
  return output
}

/**
 * Get evidence bundle by agent ID
 */
export async function getLatestEvidenceBundle(agentId: string): Promise<EvidenceBundle | null> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('evidence_bundles')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  return (data as unknown) as EvidenceBundle | null
}
