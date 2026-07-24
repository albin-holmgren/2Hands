import { NextRequest, NextResponse } from 'next/server'
import { runDailyOrchestration } from '@/lib/missions/mission-orchestrator'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  if (!cronSecret) {
    console.error('SECURITY: CRON_SECRET not configured - rejecting orchestration request')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[OrchestratorCron] Starting daily orchestration run...')
    const result = await runDailyOrchestration()
    console.log('[OrchestratorCron] Complete:', result)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[OrchestratorCron] Failed:', err)
    return NextResponse.json({ success: false, error: 'Orchestration failed' }, { status: 500 })
  }
}
