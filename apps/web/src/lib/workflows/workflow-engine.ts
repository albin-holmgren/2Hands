/**
 * Multi-Agent Workflow Engine
 *
 * Chains agents into pipelines where the output of one agent becomes
 * the input to the next. This is the "replace a team" feature.
 *
 * Examples:
 *   Lead Gen → CRM Entry → Email Outreach → Follow-up
 *   Inbox Triage → Draft Replies → Send for Review
 *   News Monitor → Content Draft → Social Post
 *
 * Workflow execution:
 *   1. User creates a workflow (or picks a template)
 *   2. Workflow triggers on schedule or manually
 *   3. Step 1 agent runs, produces output
 *   4. Engine passes output as context to step 2 agent
 *   5. Continues until all steps complete or a step fails
 *   6. Failed steps can retry, skip, or halt the workflow
 */

import { createClient } from '@/lib/supabase/server'

// ============================================================
// Types
// ============================================================

export interface Workflow {
  id: string
  userId: string
  name: string
  description: string
  status: WorkflowStatus
  steps: WorkflowStep[]
  trigger: WorkflowTrigger
  config: WorkflowConfig
  currentStepIndex: number
  lastRunAt: string | null
  lastRunStatus: 'success' | 'partial' | 'failed' | null
  totalRuns: number
  successfulRuns: number
  createdAt: string
  updatedAt: string
}

export type WorkflowStatus = 'active' | 'paused' | 'draft' | 'archived'

export interface WorkflowStep {
  id: string
  order: number
  agentId: string
  agentName: string
  taskDescription: string
  inputMapping: InputMapping
  onFailure: 'retry' | 'skip' | 'halt'
  maxRetries: number
  timeoutMinutes: number
  conditions: StepCondition[]
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  output: string | null
  startedAt: string | null
  completedAt: string | null
  error: string | null
}

export interface InputMapping {
  type: 'previous_output' | 'static' | 'merge'
  staticContext?: string
  template?: string // e.g., "Using the leads from the previous step: {{previous_output}}, update the CRM..."
}

export interface StepCondition {
  type: 'output_contains' | 'output_not_empty' | 'previous_success' | 'time_window'
  value?: string
}

export interface WorkflowTrigger {
  type: 'manual' | 'scheduled' | 'agent_completed' | 'webhook'
  cron?: string
  sourceAgentId?: string
  webhookSecret?: string
}

export interface WorkflowConfig {
  notifyOnComplete: boolean
  notifyOnFailure: boolean
  maxConcurrentSteps: number // 1 = sequential, >1 = parallel branches
  passFullContext: boolean   // pass all previous outputs or just the last one
}

export interface WorkflowRun {
  id: string
  workflowId: string
  status: 'running' | 'completed' | 'failed' | 'partial'
  stepResults: StepResult[]
  startedAt: string
  completedAt: string | null
  totalDurationMs: number | null
}

export interface StepResult {
  stepId: string
  agentId: string
  agentName: string
  status: 'completed' | 'failed' | 'skipped'
  output: string | null
  error: string | null
  durationMs: number
}

// ============================================================
// Workflow CRUD
// ============================================================

export async function createWorkflow(
  userId: string,
  workflow: {
    name: string
    description: string
    steps: Omit<WorkflowStep, 'id' | 'status' | 'output' | 'startedAt' | 'completedAt' | 'error'>[]
    trigger: WorkflowTrigger
    config?: Partial<WorkflowConfig>
  }
): Promise<Workflow | null> {
  const supabase = await createClient()

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const steps: WorkflowStep[] = workflow.steps.map((s, i) => ({
    ...s,
    id: crypto.randomUUID(),
    order: i,
    status: 'pending' as const,
    output: null,
    startedAt: null,
    completedAt: null,
    error: null,
  }))

  const fullWorkflow: Workflow = {
    id,
    userId,
    name: workflow.name,
    description: workflow.description,
    status: 'active',
    steps,
    trigger: workflow.trigger,
    config: {
      notifyOnComplete: true,
      notifyOnFailure: true,
      maxConcurrentSteps: 1,
      passFullContext: false,
      ...workflow.config,
    },
    currentStepIndex: 0,
    lastRunAt: null,
    lastRunStatus: null,
    totalRuns: 0,
    successfulRuns: 0,
    createdAt: now,
    updatedAt: now,
  }

  const { error } = await supabase
    .from('workflows')
    .insert({
      id,
      user_id: userId,
      name: fullWorkflow.name,
      description: fullWorkflow.description,
      status: fullWorkflow.status,
      steps: fullWorkflow.steps,
      trigger_config: fullWorkflow.trigger,
      workflow_config: fullWorkflow.config,
      current_step_index: 0,
      total_runs: 0,
      successful_runs: 0,
      created_at: now,
      updated_at: now,
    } as never)

  if (error) {
    console.error('[Workflow] Failed to create:', error)
    return null
  }

  return fullWorkflow
}

export async function getWorkflows(userId: string): Promise<Workflow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })

  if (error || !data) return []

  return (data as Array<Record<string, unknown>>).map(mapDbToWorkflow)
}

export async function getWorkflow(workflowId: string): Promise<Workflow | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .single()

  if (error || !data) return null
  return mapDbToWorkflow(data as Record<string, unknown>)
}

// ============================================================
// Workflow Execution
// ============================================================

/**
 * Execute a workflow — runs each step sequentially, passing outputs forward.
 */
export async function executeWorkflow(workflowId: string): Promise<WorkflowRun> {
  const supabase = await createClient()
  const workflow = await getWorkflow(workflowId)

  if (!workflow) throw new Error('Workflow not found')
  if (workflow.status !== 'active') throw new Error('Workflow is not active')

  const runId = crypto.randomUUID()
  const startedAt = new Date().toISOString()
  const stepResults: StepResult[] = []
  let previousOutput: string | null = null
  let allOutputs: string[] = []
  let overallStatus: WorkflowRun['status'] = 'running'

  // Reset all steps to pending
  const resetSteps: WorkflowStep[] = workflow.steps.map(s => ({
    ...s,
    status: 'pending' as const,
    output: null,
    startedAt: null,
    completedAt: null,
    error: null,
  }))

  // Update workflow as running
  await supabase
    .from('workflows')
    .update({
      current_step_index: 0,
      steps: resetSteps,
      last_run_at: startedAt,
      updated_at: startedAt,
    } as never)
    .eq('id', workflowId)

  // Execute steps sequentially
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i]
    const stepStart = Date.now()

    // Check conditions
    if (!evaluateConditions(step.conditions, previousOutput, stepResults)) {
      stepResults.push({
        stepId: step.id,
        agentId: step.agentId,
        agentName: step.agentName,
        status: 'skipped',
        output: null,
        error: 'Conditions not met',
        durationMs: 0,
      })
      continue
    }

    // Build task description with input from previous step
    const taskWithContext = buildStepTask(step, previousOutput, allOutputs, workflow.config.passFullContext)

    // Update step status to running
    const updatedSteps: WorkflowStep[] = [...resetSteps]
    updatedSteps[i] = { ...updatedSteps[i], status: 'running', startedAt: new Date().toISOString() }
    await supabase
      .from('workflows')
      .update({ steps: updatedSteps, current_step_index: i, updated_at: new Date().toISOString() } as never)
      .eq('id', workflowId)

    // Trigger the agent run
    let retries = 0
    let stepOutput: string | null = null
    let stepError: string | null = null
    let stepSucceeded = false

    while (retries <= step.maxRetries) {
      try {
        stepOutput = await triggerAgentRun(step.agentId, taskWithContext, workflow.userId, step.timeoutMinutes)
        stepSucceeded = true
        break
      } catch (err) {
        stepError = err instanceof Error ? err.message : String(err)
        retries++
        if (retries <= step.maxRetries) {
          console.log(`[Workflow] Step ${step.agentName} failed, retrying (${retries}/${step.maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, 5000 * retries))
        }
      }
    }

    const durationMs = Date.now() - stepStart
    const stepStatus = stepSucceeded ? 'completed' as const : 'failed' as const

    stepResults.push({
      stepId: step.id,
      agentId: step.agentId,
      agentName: step.agentName,
      status: stepStatus,
      output: stepOutput,
      error: stepError,
      durationMs,
    })

    // Update step in DB
    updatedSteps[i] = {
      ...updatedSteps[i],
      status: stepStatus,
      output: stepOutput,
      error: stepError,
      completedAt: new Date().toISOString(),
    }
    await supabase
      .from('workflows')
      .update({ steps: updatedSteps, updated_at: new Date().toISOString() } as never)
      .eq('id', workflowId)

    if (stepSucceeded) {
      previousOutput = stepOutput
      if (stepOutput) allOutputs.push(stepOutput)
    } else {
      // Handle failure based on step config
      if (step.onFailure === 'halt') {
        overallStatus = 'failed'
        break
      } else if (step.onFailure === 'skip') {
        // Continue to next step
        continue
      }
      // 'retry' is already handled above
      overallStatus = 'partial'
      break
    }
  }

  if (overallStatus === 'running') {
    overallStatus = stepResults.every(r => r.status === 'completed' || r.status === 'skipped')
      ? 'completed'
      : 'partial'
  }

  const completedAt = new Date().toISOString()
  const totalDurationMs = Date.now() - new Date(startedAt).getTime()

  // Update workflow with final state
  await supabase
    .from('workflows')
    .update({
      last_run_status: overallStatus === 'completed' ? 'success' : overallStatus,
      total_runs: workflow.totalRuns + 1,
      successful_runs: overallStatus === 'completed' ? workflow.successfulRuns + 1 : workflow.successfulRuns,
      updated_at: completedAt,
    } as never)
    .eq('id', workflowId)

  // Store the run record
  await supabase
    .from('workflow_runs')
    .insert({
      id: runId,
      workflow_id: workflowId,
      user_id: workflow.userId,
      status: overallStatus,
      step_results: stepResults,
      started_at: startedAt,
      completed_at: completedAt,
      total_duration_ms: totalDurationMs,
    } as never)

  // Notify user
  if (workflow.config.notifyOnComplete && overallStatus === 'completed') {
    try {
      const { notifyProactiveOutreach } = await import('@/lib/push-notifications')
      notifyProactiveOutreach(
        workflow.userId,
        `${workflow.name} completed`,
        `All ${workflow.steps.length} steps finished successfully.`,
        'workflow',
        'normal'
      ).catch(() => {})
    } catch { /* push not available */ }
  } else if (workflow.config.notifyOnFailure && overallStatus === 'failed') {
    try {
      const { notifyProactiveOutreach } = await import('@/lib/push-notifications')
      notifyProactiveOutreach(
        workflow.userId,
        `${workflow.name} needs attention`,
        `Workflow failed at step: ${stepResults.find(r => r.status === 'failed')?.agentName}`,
        'workflow',
        'high'
      ).catch(() => {})
    } catch { /* push not available */ }
  }

  return {
    id: runId,
    workflowId,
    status: overallStatus,
    stepResults,
    startedAt,
    completedAt,
    totalDurationMs,
  }
}

// ============================================================
// Helpers
// ============================================================

function buildStepTask(
  step: WorkflowStep,
  previousOutput: string | null,
  allOutputs: string[],
  passFullContext: boolean
): string {
  const mapping = step.inputMapping

  if (mapping.type === 'static') {
    return step.taskDescription + (mapping.staticContext ? `\n\nContext: ${mapping.staticContext}` : '')
  }

  if (mapping.type === 'merge') {
    const context = passFullContext
      ? allOutputs.map((o, i) => `Step ${i + 1} output:\n${o}`).join('\n\n---\n\n')
      : previousOutput || ''
    return step.taskDescription + (context ? `\n\nPrevious results:\n${context}` : '')
  }

  // 'previous_output' — default
  if (mapping.template && previousOutput) {
    return mapping.template.replace('{{previous_output}}', previousOutput)
  }

  return step.taskDescription + (previousOutput ? `\n\nFrom previous step:\n${previousOutput}` : '')
}

function evaluateConditions(
  conditions: StepCondition[],
  previousOutput: string | null,
  previousResults: StepResult[]
): boolean {
  if (conditions.length === 0) return true

  return conditions.every(c => {
    switch (c.type) {
      case 'output_not_empty':
        return previousOutput !== null && previousOutput.trim().length > 0
      case 'output_contains':
        return previousOutput !== null && c.value !== undefined && previousOutput.includes(c.value)
      case 'previous_success':
        return previousResults.length === 0 || previousResults[previousResults.length - 1]?.status === 'completed'
      default:
        return true
    }
  })
}

/**
 * Trigger an agent run and wait for completion.
 * Returns the agent's final output/summary.
 */
async function triggerAgentRun(
  agentId: string,
  taskDescription: string,
  userId: string,
  timeoutMinutes: number
): Promise<string> {
  const supabase = await createClient()

  // Trigger the run via internal API
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || 'http://localhost:3000'
  const response = await fetch(`${baseUrl}/api/agents/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, taskDescription }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((error as { error: string }).error || 'Failed to trigger agent run')
  }

  // Poll for completion
  const timeoutMs = timeoutMinutes * 60 * 1000
  const startTime = Date.now()
  const pollIntervalMs = 10000 // 10 seconds

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))

    const { data: agent } = await supabase
      .from('agents')
      .select('status, config')
      .eq('id', agentId)
      .single()

    if (!agent) throw new Error('Agent not found during polling')

    const agentData = agent as { status: string; config: Record<string, unknown> | null }

    if (agentData.status === 'completed' || agentData.status === 'idle') {
      // Get the last completion message from agent_progress
      const { data: lastProgress } = await supabase
        .from('agent_progress')
        .select('message')
        .eq('agent_id', agentId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      return (lastProgress as { message: string } | null)?.message || 'Task completed.'
    }

    if (agentData.status === 'failed') {
      const errorMsg = typeof agentData.config?.last_error === 'string'
        ? agentData.config.last_error
        : 'Agent failed'
      throw new Error(errorMsg as string)
    }
  }

  throw new Error(`Agent timed out after ${timeoutMinutes} minutes`)
}

function mapDbToWorkflow(data: Record<string, unknown>): Workflow {
  return {
    id: data.id as string,
    userId: data.user_id as string,
    name: data.name as string,
    description: (data.description as string) || '',
    status: data.status as WorkflowStatus,
    steps: (data.steps as WorkflowStep[]) || [],
    trigger: (data.trigger_config as WorkflowTrigger) || { type: 'manual' },
    config: (data.workflow_config as WorkflowConfig) || {
      notifyOnComplete: true,
      notifyOnFailure: true,
      maxConcurrentSteps: 1,
      passFullContext: false,
    },
    currentStepIndex: (data.current_step_index as number) || 0,
    lastRunAt: (data.last_run_at as string) || null,
    lastRunStatus: (data.last_run_status as Workflow['lastRunStatus']) || null,
    totalRuns: (data.total_runs as number) || 0,
    successfulRuns: (data.successful_runs as number) || 0,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

// ============================================================
// Workflow Templates
// ============================================================

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  icon: string
  steps: {
    agentTemplateId: string
    label: string
    onFailure: 'retry' | 'skip' | 'halt'
  }[]
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'lead-to-outreach',
    name: 'Lead Gen → Outreach Pipeline',
    description: 'Find leads, enrich their profiles, then send personalized outreach emails.',
    icon: '🎯→✉️',
    steps: [
      { agentTemplateId: 'lead-gen-agent', label: 'Find Leads', onFailure: 'halt' },
      { agentTemplateId: 'outreach-agent', label: 'Send Outreach', onFailure: 'retry' },
    ],
  },
  {
    id: 'news-to-content',
    name: 'News Monitor → Content Pipeline',
    description: 'Monitor industry news, then draft blog posts and social media content based on trending topics.',
    icon: '📰→✍️',
    steps: [
      { agentTemplateId: 'news-monitor', label: 'Monitor News', onFailure: 'halt' },
      { agentTemplateId: 'content-writer', label: 'Draft Content', onFailure: 'retry' },
      { agentTemplateId: 'social-media-agent', label: 'Post to Social', onFailure: 'skip' },
    ],
  },
  {
    id: 'inbox-triage-pipeline',
    name: 'Email Triage → Response Pipeline',
    description: 'Triage incoming emails, draft responses for routine ones, and escalate important ones.',
    icon: '📬→📧',
    steps: [
      { agentTemplateId: 'email-inbox-manager', label: 'Triage Inbox', onFailure: 'halt' },
      { agentTemplateId: 'email-support-agent', label: 'Draft Responses', onFailure: 'retry' },
    ],
  },
  {
    id: 'recruit-pipeline',
    name: 'Talent Sourcing → Research Pipeline',
    description: 'Source candidates from job boards, then deep-research the top ones for a detailed shortlist.',
    icon: '🔎→📋',
    steps: [
      { agentTemplateId: 'recruiter-agent', label: 'Source Candidates', onFailure: 'halt' },
      { agentTemplateId: 'market-research-agent', label: 'Deep Research Top Candidates', onFailure: 'skip' },
    ],
  },
]
