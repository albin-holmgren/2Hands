import { createAdminClient } from '@/lib/supabase/server'

interface RunMetricRow {
  status: string
  started_at: string
  completed_at: string | null
  failure_reason: string | null
}

interface RetryFailureRow {
  was_retried: boolean
  retry_succeeded: boolean | null
}

export interface RuntimeReadinessReport {
  windowDays: number
  totalRuns: number
  successRate: number
  failureRate: number
  p95DurationMs: number
  retryExhaustedCount: number
  topFailureReasons: Array<{ reason: string; count: number }>
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

export function buildRuntimeReadinessReportFromRows(
  runs: RunMetricRow[],
  failures: RetryFailureRow[],
  windowDays: number
): RuntimeReadinessReport {
  const totalRuns = runs.length
  const successfulRuns = runs.filter(r => r.status === 'completed').length
  const failedRuns = runs.filter(r => r.status === 'failed' || r.status === 'timeout').length

  const durations: number[] = []
  const reasonCounts: Record<string, number> = {}
  for (const run of runs) {
    if (run.started_at && run.completed_at) {
      const duration = new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
      if (duration >= 0) durations.push(duration)
    }
    if (run.failure_reason && run.failure_reason.trim()) {
      const reason = run.failure_reason.trim()
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
    }
  }

  const topFailureReasons = Object.entries(reasonCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }))

  const retryExhaustedCount = failures.filter(f => f.was_retried && f.retry_succeeded === false).length

  return {
    windowDays,
    totalRuns,
    successRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
    failureRate: totalRuns > 0 ? failedRuns / totalRuns : 0,
    p95DurationMs: percentile(durations, 95),
    retryExhaustedCount,
    topFailureReasons,
  }
}

export async function getRuntimeReadinessReport(userId?: string, windowDays: number = 7): Promise<RuntimeReadinessReport> {
  const supabase = createAdminClient()
  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  let runsQuery = supabase
    .from('agent_run_metrics')
    .select('status, started_at, completed_at, failure_reason')
    .gte('started_at', sinceIso)

  if (userId) {
    runsQuery = runsQuery.eq('user_id', userId)
  }

  let failuresQuery = supabase
    .from('agent_failures')
    .select('was_retried, retry_succeeded')
    .gte('created_at', sinceIso)

  const [{ data: runs }, { data: failures }] = await Promise.all([runsQuery, failuresQuery])

  return buildRuntimeReadinessReportFromRows(
    (runs || []) as RunMetricRow[],
    (failures || []) as RetryFailureRow[],
    windowDays
  )
}
