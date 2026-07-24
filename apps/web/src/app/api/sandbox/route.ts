/**
 * Sandbox Testing API Route
 * 
 * Run safety tests against agent behavior in simulated environments.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  runSandboxScenario,
  runFullSandboxSuite,
  getSandboxScenarios,
  createSandboxScenario,
} from '@/lib/testing/sandbox-testing'

const CRON_SECRET = (process.env.CRON_SECRET || '').trim() || undefined

/**
 * POST /api/sandbox - Run sandbox tests
 * 
 * Body: { scenario_id?: string, category?: string, risk_level?: string, model?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const isScheduled = authHeader === `Bearer ${CRON_SECRET}`
    
    const body = await request.json().catch(() => ({}))
    const { scenario_id, category, risk_level, model } = body as {
      scenario_id?: string
      category?: string
      risk_level?: string
      model?: string
    }
    
    const testModel = model || 'claude-3-5-sonnet-20241022'
    
    if (scenario_id) {
      // Run single scenario
      const supabase = createAdminClient()
      const { data: scenario, error } = await supabase
        .from('sandbox_scenarios')
        .select('*')
        .eq('id', scenario_id)
        .single()
      
      if (error || !scenario) {
        return NextResponse.json(
          { error: 'Scenario not found' },
          { status: 404 }
        )
      }
      
      const typedScenario = scenario as unknown as Parameters<typeof runSandboxScenario>[0]
      const result = await runSandboxScenario(typedScenario, testModel)
      
      return NextResponse.json({
        success: true,
        result: {
          scenario_name: typedScenario.name,
          passed: result.passed,
          safety_score: result.safety_score,
          risky_actions_attempted: result.risky_actions_attempted,
          evaluator_notes: result.evaluator_notes,
        },
      })
    }
    
    // Run full suite
    console.log(`[Sandbox API] Running full sandbox suite`)
    const suiteResult = await runFullSandboxSuite(testModel, {
      category,
      riskLevel: risk_level,
    })
    
    return NextResponse.json({
      success: true,
      summary: {
        total: suiteResult.total,
        passed: suiteResult.passed,
        failed: suiteResult.failed,
        avg_safety_score: suiteResult.avg_safety_score,
        pass_rate: suiteResult.total > 0 ? suiteResult.passed / suiteResult.total : 0,
      },
      results: suiteResult.results.map(r => ({
        scenario_id: r.scenario_id,
        passed: r.passed,
        safety_score: r.safety_score,
        risky_actions_attempted: r.risky_actions_attempted,
      })),
    })
    
  } catch (error) {
    console.error('[Sandbox API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sandbox test failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/sandbox - Get scenarios and results
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || undefined
    const riskLevel = searchParams.get('risk_level') || undefined
    
    const scenarios = await getSandboxScenarios(category, riskLevel)
    
    // Get recent results
    const supabase = createAdminClient()
    const { data: results } = await supabase
      .from('sandbox_results')
      .select('*, sandbox_scenarios(name, category, risk_level)')
      .order('created_at', { ascending: false })
      .limit(100)
    
    return NextResponse.json({
      scenarios,
      recent_results: results || [],
    })
    
  } catch (error) {
    console.error('[Sandbox API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch sandbox data' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/sandbox - Create new scenario
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, category, risk_level, setup_prompt, risky_actions, safe_actions, expected_behavior } = body
    
    if (!name || !category || !setup_prompt) {
      return NextResponse.json(
        { error: 'Missing required fields: name, category, setup_prompt' },
        { status: 400 }
      )
    }
    
    const scenario = await createSandboxScenario({
      name,
      description: description || null,
      category,
      risk_level: risk_level || 'medium',
      setup_prompt,
      risky_actions: risky_actions || [],
      safe_actions: safe_actions || [],
      expected_behavior: expected_behavior || '',
    })
    
    return NextResponse.json({
      success: true,
      scenario,
    })
    
  } catch (error) {
    console.error('[Sandbox API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create scenario' },
      { status: 500 }
    )
  }
}
