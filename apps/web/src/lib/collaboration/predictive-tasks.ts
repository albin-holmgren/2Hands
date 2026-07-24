/**
 * Predictive Task Anticipation
 * 
 * Learns user patterns and anticipates tasks before they're requested.
 * Suggests or pre-prepares tasks based on time, events, and sequences.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, extractTextFromResponse } from '@/lib/ai/ai-client'

export interface TaskPredictionPattern {
  id: string
  user_id: string
  pattern_name: string
  trigger_type: 'time_based' | 'event_based' | 'sequence_based'
  trigger_conditions: {
    day_of_week?: number[]
    hour?: number
    minute?: number
    after_task?: string
    delay_minutes?: number
    follows?: string[]
    probability?: number
  }
  predicted_task: string
  predicted_agent_id?: string
  confidence: number
  times_triggered: number
  times_correct: number
  is_active: boolean
  last_triggered_at?: string
}

export interface PredictedTask {
  id: string
  user_id: string
  pattern_id?: string
  predicted_task: string
  prediction_reason: string
  confidence: number
  suggested_time: string
  expires_at: string
  status: 'pending' | 'shown' | 'accepted' | 'rejected' | 'expired'
  shown_at?: string
  user_response?: string
  created_agent_id?: string
}

/**
 * Analyze user history to detect patterns
 */
export async function detectPatterns(userId: string): Promise<TaskPredictionPattern[]> {
  const supabase = createAdminClient()
  const detectedPatterns: TaskPredictionPattern[] = []

  // Get recent agent tasks
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, task, created_at, last_run_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (!agents || agents.length < 5) return []

  const tasks = agents as Array<{
    id: string
    name: string
    task: string
    created_at: string
    last_run_at: string
  }>

  // Detect time-based patterns
  const timePatterns = detectTimePatterns(tasks)
  detectedPatterns.push(...timePatterns.map(p => ({ ...p, id: '', user_id: userId })))

  // Detect sequence patterns
  const sequencePatterns = await detectSequencePatterns(tasks)
  detectedPatterns.push(...sequencePatterns.map(p => ({ ...p, id: '', user_id: userId })))

  return detectedPatterns
}

/**
 * Detect time-based patterns (e.g., "every Monday at 9am")
 */
function detectTimePatterns(tasks: Array<{
  task: string
  created_at: string
}>): Omit<TaskPredictionPattern, 'id' | 'user_id'>[] {
  const patterns: Omit<TaskPredictionPattern, 'id' | 'user_id'>[] = []

  // Group tasks by similar content
  const taskGroups: Record<string, Date[]> = {}
  for (const task of tasks) {
    const key = task.task.toLowerCase().slice(0, 50)
    if (!taskGroups[key]) taskGroups[key] = []
    taskGroups[key].push(new Date(task.created_at))
  }

  // Find recurring patterns
  for (const [taskKey, dates] of Object.entries(taskGroups)) {
    if (dates.length < 3) continue

    // Check for same day of week
    const dayOfWeek = dates[0].getDay()
    const sameDayCount = dates.filter(d => d.getDay() === dayOfWeek).length
    if (sameDayCount >= dates.length * 0.7) {
      // Check for similar hour
      const hour = dates[0].getHours()
      const sameHourCount = dates.filter(d => Math.abs(d.getHours() - hour) <= 1).length

      if (sameHourCount >= dates.length * 0.5) {
        patterns.push({
          pattern_name: `Weekly task on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]}`,
          trigger_type: 'time_based',
          trigger_conditions: {
            day_of_week: [dayOfWeek],
            hour,
            minute: 0,
          },
          predicted_task: taskKey,
          confidence: sameDayCount / dates.length,
          times_triggered: 0,
          times_correct: 0,
          is_active: true,
        })
      }
    }
  }

  return patterns
}

/**
 * Detect sequence patterns (e.g., "after checking email, usually posts on LinkedIn")
 */
async function detectSequencePatterns(tasks: Array<{
  task: string
  created_at: string
}>): Promise<Omit<TaskPredictionPattern, 'id' | 'user_id'>[]> {
  const patterns: Omit<TaskPredictionPattern, 'id' | 'user_id'>[] = []

  // Sort by time
  const sorted = [...tasks].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  // Find sequences that occur multiple times
  const sequences: Record<string, number> = {}
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i].task.toLowerCase().slice(0, 30)
    const next = sorted[i + 1].task.toLowerCase().slice(0, 30)
    
    // Check if they're close in time (within 2 hours)
    const timeDiff = new Date(sorted[i + 1].created_at).getTime() - new Date(sorted[i].created_at).getTime()
    if (timeDiff < 2 * 60 * 60 * 1000) {
      const key = `${current}|${next}`
      sequences[key] = (sequences[key] || 0) + 1
    }
  }

  // Find frequent sequences
  for (const [key, count] of Object.entries(sequences)) {
    if (count >= 3) {
      const [first, second] = key.split('|')
      patterns.push({
        pattern_name: `After "${first.slice(0, 20)}..." do "${second.slice(0, 20)}..."`,
        trigger_type: 'sequence_based',
        trigger_conditions: {
          follows: [first],
          probability: count / tasks.length,
        },
        predicted_task: second,
        confidence: Math.min(0.9, count / 5),
        times_triggered: 0,
        times_correct: 0,
        is_active: true,
      })
    }
  }

  return patterns
}

/**
 * Save detected patterns
 */
export async function savePatterns(patterns: TaskPredictionPattern[]): Promise<number> {
  const supabase = createAdminClient()
  let saved = 0

  for (const pattern of patterns) {
    const { error } = await supabase
      .from('task_prediction_patterns')
      .upsert({
        user_id: pattern.user_id,
        pattern_name: pattern.pattern_name,
        trigger_type: pattern.trigger_type,
        trigger_conditions: pattern.trigger_conditions,
        predicted_task: pattern.predicted_task,
        predicted_agent_id: pattern.predicted_agent_id,
        confidence: pattern.confidence,
        is_active: true,
      } as never, {
        onConflict: 'user_id,pattern_name',
        ignoreDuplicates: true,
      })

    if (!error) saved++
  }

  return saved
}

/**
 * Check if any patterns should trigger now
 */
export async function checkPatternTriggers(userId: string): Promise<PredictedTask[]> {
  const supabase = createAdminClient()
  const predictions: PredictedTask[] = []
  const now = new Date()

  // Get active patterns
  const { data: patterns } = await supabase
    .from('task_prediction_patterns')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gt('confidence', 0.5)

  if (!patterns) return []

  for (const pattern of patterns as TaskPredictionPattern[]) {
    let shouldTrigger = false
    let reason = ''

    if (pattern.trigger_type === 'time_based') {
      const cond = pattern.trigger_conditions
      const dayMatch = !cond.day_of_week || cond.day_of_week.includes(now.getDay())
      const hourMatch = cond.hour === undefined || Math.abs(now.getHours() - cond.hour) <= 1

      if (dayMatch && hourMatch) {
        shouldTrigger = true
        reason = `It's ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()]} around ${cond.hour}:00, and you usually do this task at this time.`
      }
    }

    if (shouldTrigger) {
      // Check if we already suggested this recently
      const { data: recent } = await supabase
        .from('predicted_tasks')
        .select('id')
        .eq('user_id', userId)
        .eq('pattern_id', pattern.id)
        .gt('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
        .limit(1)

      if (!recent || recent.length === 0) {
        predictions.push({
          id: '',
          user_id: userId,
          pattern_id: pattern.id,
          predicted_task: pattern.predicted_task,
          prediction_reason: reason,
          confidence: pattern.confidence,
          suggested_time: now.toISOString(),
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          status: 'pending',
        })
      }
    }
  }

  return predictions
}

/**
 * Save predicted tasks
 */
export async function savePredictedTasks(tasks: PredictedTask[]): Promise<string[]> {
  const supabase = createAdminClient()
  const ids: string[] = []

  for (const task of tasks) {
    const { data, error } = await supabase
      .from('predicted_tasks')
      .insert({
        user_id: task.user_id,
        pattern_id: task.pattern_id,
        predicted_task: task.predicted_task,
        prediction_reason: task.prediction_reason,
        confidence: task.confidence,
        suggested_time: task.suggested_time,
        expires_at: task.expires_at,
        status: 'pending',
      } as never)
      .select('id')
      .single()

    if (!error && data) {
      ids.push((data as { id: string }).id)
    }
  }

  return ids
}

/**
 * Get pending predictions for a user
 */
export async function getPendingPredictions(userId: string): Promise<PredictedTask[]> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('predicted_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('confidence', { ascending: false })
    .limit(5)

  return (data || []) as PredictedTask[]
}

/**
 * Record user response to a prediction
 */
export async function recordPredictionResponse(
  predictionId: string,
  response: 'accept' | 'reject' | 'later',
  createdAgentId?: string
): Promise<void> {
  const supabase = createAdminClient()

  await supabase
    .from('predicted_tasks')
    .update({
      status: response === 'accept' ? 'accepted' : response === 'reject' ? 'rejected' : 'pending',
      user_response: response,
      created_agent_id: createdAgentId,
    } as never)
    .eq('id', predictionId)

  // Update pattern accuracy
  const { data: prediction } = await supabase
    .from('predicted_tasks')
    .select('pattern_id')
    .eq('id', predictionId)
    .single()

  if (prediction) {
    const typed = prediction as { pattern_id: string | null }
    if (typed.pattern_id) {
      const { data: pattern } = await supabase
        .from('task_prediction_patterns')
        .select('times_triggered, times_correct')
        .eq('id', typed.pattern_id)
        .single()

      if (pattern) {
        const p = pattern as { times_triggered: number; times_correct: number }
        await supabase
          .from('task_prediction_patterns')
          .update({
            times_triggered: p.times_triggered + 1,
            times_correct: response === 'accept' ? p.times_correct + 1 : p.times_correct,
            confidence: (p.times_correct + (response === 'accept' ? 1 : 0)) / (p.times_triggered + 1),
            last_triggered_at: new Date().toISOString(),
          } as never)
          .eq('id', typed.pattern_id)
      }
    }
  }
}

/**
 * Format predictions for AI Manager to suggest
 */
export function formatPredictionsForAIManager(predictions: PredictedTask[]): string {
  if (predictions.length === 0) return ''

  let output = '\n## Task Predictions\n\n'
  output += '_Based on your patterns, you might want to:_\n\n'

  for (const pred of predictions.slice(0, 3)) {
    const conf = Math.round(pred.confidence * 100)
    output += `**${pred.predicted_task.slice(0, 100)}**\n`
    output += `_${pred.prediction_reason}_ (${conf}% confidence)\n\n`
  }

  output += '_Would you like me to set up any of these tasks?_\n'

  return output
}

/**
 * Run pattern detection and prediction (call periodically)
 */
export async function runPredictionCycle(userId: string): Promise<{
  patternsDetected: number
  predictionsCreated: number
}> {
  // Detect new patterns
  const patterns = await detectPatterns(userId)
  const savedPatterns = await savePatterns(patterns)

  // Check for triggers
  const predictions = await checkPatternTriggers(userId)
  const savedIds = await savePredictedTasks(predictions)

  return {
    patternsDetected: savedPatterns,
    predictionsCreated: savedIds.length,
  }
}
