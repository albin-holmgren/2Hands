/**
 * Evaluation Backbone (EDDOps)
 * 
 * Runs golden test cases, tracks metrics, detects regressions, and logs remediation.
 * This is the foundation for proving AI quality improvements week-over-week.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, extractTextFromResponse } from '@/lib/ai/ai-client'

// Types
interface EvalTestCase {
  id: string
  name: string
  description: string | null
  category: string
  difficulty: string
  task_prompt: string
  expected_tools: string[]
  expected_outcome: string | null
  validation_criteria: Record<string, unknown>
  timeout_seconds: number
}

interface EvalResult {
  test_case_id: string
  status: 'passed' | 'failed' | 'error' | 'timeout' | 'skipped'
  score: number
  steps_taken: number
  tools_called: string[]
  tool_errors: number
  human_escalations: number
  total_tokens: number
  total_cost_cents: number
  duration_ms: number
  error_message?: string
  full_trace: Record<string, unknown>
  evaluator_notes?: string
}

interface EvalRunSummary {
  total_cases: number
  passed: number
  failed: number
  errors: number
  timeouts: number
  avg_score: number
  avg_steps: number
  avg_duration_ms: number
  total_cost_cents: number
  total_tokens: number
  pass_rate: number
  regression_detected: boolean
  regression_details?: string[]
}

// Cost per 1M tokens (approximate)
const MODEL_COSTS = {
  'claude-3-5-haiku-20241022': { input: 1.00, output: 5.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
}

/**
 * Start a new evaluation run
 */
export async function startEvalRun(
  runType: 'scheduled' | 'manual' | 'regression' | 'pre_deploy',
  triggeredBy: string,
  modelConfig?: Record<string, string>
): Promise<string> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('eval_runs')
    .insert({
      run_type: runType,
      triggered_by: triggeredBy,
      model_config: modelConfig || {},
      status: 'running',
    } as never)
    .select('id')
    .single()
  
  if (error) throw error
  return (data as { id: string }).id
}

/**
 * Get all active test cases
 */
export async function getTestCases(category?: string): Promise<EvalTestCase[]> {
  const supabase = createAdminClient()
  
  let query = supabase
    .from('eval_test_cases')
    .select('*')
    .eq('is_active', true)
  
  if (category) {
    query = query.eq('category', category)
  }
  
  const { data, error } = await query
  if (error) throw error
  return data as EvalTestCase[]
}

/**
 * Run a single test case and evaluate the result
 */
export async function runTestCase(
  testCase: EvalTestCase,
  model: string = 'claude-3-5-sonnet-20241022'
): Promise<EvalResult> {
  const startTime = Date.now()
  const toolsCalled: string[] = []
  const toolErrors = 0
  let humanEscalations = 0
  let totalTokens = 0
  const trace: Record<string, unknown>[] = []
  
  try {
    // Simulate agent execution with the task prompt
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      system: `You are an AI agent being evaluated. Complete the following task as best you can.
If you would use a tool, describe which tool and with what arguments.
If you need human approval, say "HUMAN_ESCALATION_NEEDED".
Be concise and action-oriented.`,
      messages: [
        { role: 'user', content: testCase.task_prompt }
      ],
    })
    
    totalTokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
    
    const responseText = extractTextFromResponse(response)
    
    trace.push({ type: 'response', content: responseText })
    
    // Parse tool calls from response
    const toolCallMatch = responseText.match(/TOOL_CALL:\s*(.+)/gi) || []
    toolsCalled.push(...toolCallMatch.map((m: string) => m.replace(/TOOL_CALL:\s*/i, '')))
    
    // Check for human escalations
    if (responseText.includes('HUMAN_ESCALATION_NEEDED')) {
      humanEscalations++
    }
    
    // Evaluate the result using LLM
    const { response: evalResponse } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 1024,
      system: `You are an evaluation judge. Score the agent's response from 0.0 to 1.0.
Consider:
- Did the agent understand the task correctly?
- Did it take appropriate actions?
- Did it avoid unnecessary steps?
- Did it handle edge cases?

Output format:
SCORE: X.XX
PASSED: true/false
NOTES: Brief explanation`,
      messages: [
        {
          role: 'user',
          content: `Task: ${testCase.task_prompt}

Expected outcome: ${testCase.expected_outcome || 'Complete the task successfully'}

Agent response:
${responseText}

Expected tools: ${JSON.stringify(testCase.expected_tools)}
Tools used: ${JSON.stringify(toolsCalled)}`
        }
      ],
    })
    
    totalTokens += (evalResponse.usage?.input_tokens || 0) + (evalResponse.usage?.output_tokens || 0)
    
    const evalText = extractTextFromResponse(evalResponse)
    
    const scoreMatch = evalText.match(/SCORE:\s*([\d.]+)/)
    const passedMatch = evalText.match(/PASSED:\s*(true|false)/i)
    const notesMatch = evalText.match(/NOTES:\s*([\s\S]+)/)
    
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0.5
    const passed = passedMatch ? passedMatch[1].toLowerCase() === 'true' : score >= 0.7
    const notes = notesMatch ? notesMatch[1].trim() : ''
    
    const durationMs = Date.now() - startTime
    const costCents = calculateCost(totalTokens, model)
    
    return {
      test_case_id: testCase.id,
      status: passed ? 'passed' : 'failed',
      score,
      steps_taken: 1 + toolsCalled.length,
      tools_called: toolsCalled,
      tool_errors: toolErrors,
      human_escalations: humanEscalations,
      total_tokens: totalTokens,
      total_cost_cents: costCents,
      duration_ms: durationMs,
      full_trace: { steps: trace },
      evaluator_notes: notes,
    }
    
  } catch (error) {
    const durationMs = Date.now() - startTime
    return {
      test_case_id: testCase.id,
      status: 'error',
      score: 0,
      steps_taken: 0,
      tools_called: toolsCalled,
      tool_errors: toolErrors + 1,
      human_escalations: humanEscalations,
      total_tokens: totalTokens,
      total_cost_cents: 0,
      duration_ms: durationMs,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      full_trace: { steps: trace, error: String(error) },
    }
  }
}

/**
 * Save evaluation result
 */
export async function saveEvalResult(runId: string, result: EvalResult): Promise<void> {
  const supabase = createAdminClient()
  
  const { error } = await supabase
    .from('eval_results')
    .insert({
      run_id: runId,
      ...result,
    } as never)
  
  if (error) throw error
}

/**
 * Complete an evaluation run and compute summary
 */
export async function completeEvalRun(runId: string): Promise<EvalRunSummary> {
  const supabase = createAdminClient()
  
  // Get all results for this run
  const { data: resultsData, error } = await supabase
    .from('eval_results')
    .select('*')
    .eq('run_id', runId)
  
  if (error) throw error
  
  const results = (resultsData || []) as Array<{
    status: string
    score: number
    steps_taken: number
    duration_ms: number
    total_cost_cents: number
    total_tokens: number
  }>
  
  const summary: EvalRunSummary = {
    total_cases: results.length,
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed').length,
    errors: results.filter(r => r.status === 'error').length,
    timeouts: results.filter(r => r.status === 'timeout').length,
    avg_score: results.length > 0 ? results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length : 0,
    avg_steps: results.length > 0 ? results.reduce((sum, r) => sum + (r.steps_taken || 0), 0) / results.length : 0,
    avg_duration_ms: results.length > 0 ? results.reduce((sum, r) => sum + (r.duration_ms || 0), 0) / results.length : 0,
    total_cost_cents: results.reduce((sum, r) => sum + (r.total_cost_cents || 0), 0),
    total_tokens: results.reduce((sum, r) => sum + (r.total_tokens || 0), 0),
    pass_rate: results.length > 0 ? results.filter(r => r.status === 'passed').length / results.length : 0,
    regression_detected: false,
  }
  
  // Check for regressions against previous run
  const { data: previousRuns } = await supabase
    .from('eval_runs')
    .select('id, summary')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
  
  const typedPrevRuns = (previousRuns || []) as Array<{ id: string; summary: EvalRunSummary | null }>
  if (typedPrevRuns.length > 0) {
    const prevSummary = typedPrevRuns[0].summary
    if (prevSummary) {
      const regressions: string[] = []
      
      // Check for significant regressions (>10% drop)
      if (summary.pass_rate < prevSummary.pass_rate * 0.9) {
        regressions.push(`Pass rate dropped: ${(prevSummary.pass_rate * 100).toFixed(1)}% → ${(summary.pass_rate * 100).toFixed(1)}%`)
      }
      if (summary.avg_score < prevSummary.avg_score * 0.9) {
        regressions.push(`Avg score dropped: ${prevSummary.avg_score.toFixed(3)} → ${summary.avg_score.toFixed(3)}`)
      }
      if (summary.total_cost_cents > prevSummary.total_cost_cents * 1.2) {
        regressions.push(`Cost increased: $${(prevSummary.total_cost_cents / 100).toFixed(2)} → $${(summary.total_cost_cents / 100).toFixed(2)}`)
      }
      
      if (regressions.length > 0) {
        summary.regression_detected = true
        summary.regression_details = regressions
        
        // Create alerts
        for (const detail of regressions) {
          await supabase.from('eval_alerts').insert({
            run_id: runId,
            alert_type: 'regression',
            severity: 'warning',
            metric_name: detail.split(':')[0],
            description: detail,
          } as never)
        }
      }
    }
  }
  
  // Update the run
  await supabase
    .from('eval_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      summary,
    } as never)
    .eq('id', runId)
  
  return summary
}

/**
 * Run full evaluation suite
 */
export async function runFullEvaluation(
  triggeredBy: string,
  options?: {
    category?: string
    model?: string
    runType?: 'scheduled' | 'manual' | 'regression' | 'pre_deploy'
  }
): Promise<{ runId: string; summary: EvalRunSummary }> {
  const runType = options?.runType || 'manual'
  const model = options?.model || 'claude-3-5-sonnet-20241022'
  
  const runId = await startEvalRun(runType, triggeredBy, { primary_model: model })
  const testCases = await getTestCases(options?.category)
  
  console.log(`[Eval] Starting run ${runId} with ${testCases.length} test cases`)
  
  for (const testCase of testCases) {
    console.log(`[Eval] Running: ${testCase.name}`)
    const result = await runTestCase(testCase, model)
    await saveEvalResult(runId, result)
    console.log(`[Eval] Result: ${result.status} (score: ${result.score.toFixed(3)})`)
  }
  
  const summary = await completeEvalRun(runId)
  console.log(`[Eval] Completed. Pass rate: ${(summary.pass_rate * 100).toFixed(1)}%`)
  
  if (summary.regression_detected) {
    console.warn(`[Eval] REGRESSION DETECTED:`, summary.regression_details)
  }
  
  return { runId, summary }
}

/**
 * Calculate cost in cents
 */
function calculateCost(tokens: number, model: string): number {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS] || MODEL_COSTS['claude-3-5-sonnet-20241022']
  // Rough estimate: 60% input, 40% output
  const inputTokens = tokens * 0.6
  const outputTokens = tokens * 0.4
  return ((inputTokens * costs.input) + (outputTokens * costs.output)) / 10000 // per 1M to per token, to cents
}

/**
 * Seed default test cases
 */
export async function seedDefaultTestCases(): Promise<void> {
  const supabase = createAdminClient()
  
  const defaultCases = [
    {
      name: 'Simple email draft',
      category: 'email',
      difficulty: 'easy',
      task_prompt: 'Draft a brief email to my team thanking them for their hard work this week.',
      expected_tools: ['draft_email'],
      expected_outcome: 'A professional, warm thank-you email is drafted',
    },
    {
      name: 'Research and summarize',
      category: 'research',
      difficulty: 'medium',
      task_prompt: 'Research the latest trends in AI agents and provide a brief summary with 3 key points.',
      expected_tools: ['web_search', 'analyze_url'],
      expected_outcome: 'A concise summary with 3 relevant, accurate points about AI agent trends',
    },
    {
      name: 'Schedule meeting with conflict',
      category: 'scheduling',
      difficulty: 'medium',
      task_prompt: 'Schedule a meeting with John tomorrow at 2pm. Note: I already have a dentist appointment at 2pm.',
      expected_tools: ['check_calendar', 'create_event'],
      expected_outcome: 'Agent detects conflict and asks for clarification or suggests alternative time',
    },
    {
      name: 'Create agent for monitoring',
      category: 'general',
      difficulty: 'medium',
      task_prompt: 'Create an agent that monitors my competitor\'s website for price changes daily.',
      expected_tools: ['create_agent'],
      expected_outcome: 'Agent is created with appropriate schedule and clear task description',
    },
    {
      name: 'Handle ambiguous request',
      category: 'general',
      difficulty: 'hard',
      task_prompt: 'Do that thing we talked about yesterday.',
      expected_tools: [],
      expected_outcome: 'Agent asks for clarification rather than making assumptions',
    },
  ]
  
  for (const testCase of defaultCases) {
    await supabase
      .from('eval_test_cases')
      .upsert(testCase as never, { onConflict: 'name' })
  }
}
