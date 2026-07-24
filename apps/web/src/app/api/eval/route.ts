/**
 * Evaluation API Route
 * 
 * Endpoints for running evaluation suite, checking status, and viewing results.
 * Protected by CRON_SECRET for scheduled runs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { 
  runFullEvaluation, 
  seedDefaultTestCases,
  getTestCases 
} from '@/lib/evaluation/eval-runner'

const CRON_SECRET = (process.env.CRON_SECRET || '').trim() || undefined

/**
 * POST /api/eval - Run evaluation suite
 * 
 * Body: { category?: string, model?: string, runType?: string }
 * Headers: Authorization: Bearer <CRON_SECRET> (for scheduled runs)
 */
export async function POST(request: NextRequest) {
  try {
    // Check authorization for automated runs
    const authHeader = request.headers.get('Authorization')
    const isScheduled = authHeader === `Bearer ${CRON_SECRET}`
    
    let triggeredBy = 'manual'
    if (isScheduled) {
      triggeredBy = 'cron'
    }
    
    const body = await request.json().catch(() => ({}))
    const { category, model, runType } = body as {
      category?: string
      model?: string
      runType?: 'scheduled' | 'manual' | 'regression' | 'pre_deploy'
    }
    
    console.log(`[Eval API] Starting evaluation run (triggered by: ${triggeredBy})`)
    
    const { runId, summary } = await runFullEvaluation(triggeredBy, {
      category,
      model,
      runType: runType || (isScheduled ? 'scheduled' : 'manual'),
    })
    
    return NextResponse.json({
      success: true,
      run_id: runId,
      summary: {
        total_cases: summary.total_cases,
        passed: summary.passed,
        failed: summary.failed,
        pass_rate: summary.pass_rate,
        avg_score: summary.avg_score,
        total_cost_cents: summary.total_cost_cents,
        regression_detected: summary.regression_detected,
        regression_details: summary.regression_details,
      },
    })
    
  } catch (error) {
    console.error('[Eval API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Evaluation failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/eval - Get evaluation status and history
 * 
 * Query params: 
 * - run_id: specific run to fetch
 * - days: number of days of history (default 7)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const runId = searchParams.get('run_id')
    const days = parseInt(searchParams.get('days') || '7')
    
    const supabase = createAdminClient()
    
    if (runId) {
      // Get specific run
      const { data: run, error: runError } = await supabase
        .from('eval_runs')
        .select('*')
        .eq('id', runId)
        .single()
      
      if (runError) throw runError
      
      // Get results for this run
      const { data: results } = await supabase
        .from('eval_results')
        .select('*, eval_test_cases(name, category)')
        .eq('run_id', runId)
      
      return NextResponse.json({
        run,
        results: results || [],
      })
    }
    
    // Get recent runs
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    
    const { data: runs } = await supabase
      .from('eval_runs')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(50)
    
    // Get alerts
    const { data: alerts } = await supabase
      .from('eval_alerts')
      .select('*')
      .gte('created_at', since.toISOString())
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
    
    // Get test cases
    const testCases = await getTestCases()
    
    return NextResponse.json({
      runs: runs || [],
      unacknowledged_alerts: alerts || [],
      test_case_count: testCases.length,
    })
    
  } catch (error) {
    console.error('[Eval API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch evaluation data' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/eval - Seed test cases or acknowledge alerts
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, alert_id } = body as { action: string; alert_id?: string }
    
    if (action === 'seed') {
      await seedDefaultTestCases()
      return NextResponse.json({ success: true, message: 'Test cases seeded' })
    }
    
    if (action === 'acknowledge' && alert_id) {
      const supabase = createAdminClient()
      await supabase
        .from('eval_alerts')
        .update({ acknowledged_at: new Date().toISOString() } as never)
        .eq('id', alert_id)
      
      return NextResponse.json({ success: true, message: 'Alert acknowledged' })
    }
    
    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
    
  } catch (error) {
    console.error('[Eval API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 }
    )
  }
}
