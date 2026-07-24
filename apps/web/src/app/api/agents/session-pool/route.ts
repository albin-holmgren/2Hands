export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import {
  cleanupExpiredSessions,
  reclaimExpiredPoolLeases,
  runSessionPoolHealthChecks,
  promoteHealthyWarmingSlots,
  getSessionPoolStats,
} from '@/lib/compute/session-manager'

function verifyCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()

  if (!cronSecret) {
    console.error('SECURITY: CRON_SECRET not configured - rejecting session pool maintenance request')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const healthLimitParam = request.nextUrl.searchParams.get('healthLimit')
  const healthLimit = Math.max(1, Math.min(200, Number(healthLimitParam || '50') || 50))

  try {
    const [
      expiredSessionsCleaned,
      leaseReclaim,
      promotedSlots,
      healthChecks,
      poolStats,
    ] = await Promise.all([
      cleanupExpiredSessions(),
      reclaimExpiredPoolLeases(),
      promoteHealthyWarmingSlots(),
      runSessionPoolHealthChecks(healthLimit),
      getSessionPoolStats(),
    ])

    return NextResponse.json({
      success: true,
      maintenance: {
        expiredSessionsCleaned,
        leaseReclaim,
        promotedSlots,
        healthChecks,
      },
      poolStats,
      currentTime: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[SessionPoolMaintenance] Failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Session pool maintenance failed' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Vercel cron jobs send GET requests with the x-vercel-cron: 1 header.
  // When invoked by the cron, run the full maintenance cycle (same as POST).
  const isCron = request.headers.get('x-vercel-cron') === '1'

  if (isCron) {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    const healthLimitParam = request.nextUrl.searchParams.get('healthLimit')
    const healthLimit = Math.max(1, Math.min(200, Number(healthLimitParam || '50') || 50))

    try {
      const [
        expiredSessionsCleaned,
        leaseReclaim,
        promotedSlots,
        healthChecks,
        poolStats,
      ] = await Promise.all([
        cleanupExpiredSessions(),
        reclaimExpiredPoolLeases(),
        promoteHealthyWarmingSlots(),
        runSessionPoolHealthChecks(healthLimit),
        getSessionPoolStats(),
      ])

      return NextResponse.json({
        success: true,
        maintenance: {
          expiredSessionsCleaned,
          leaseReclaim,
          promotedSlots,
          healthChecks,
        },
        poolStats,
        currentTime: new Date().toISOString(),
      })
    } catch (error) {
      console.error('[SessionPoolMaintenance] Cron maintenance failed:', error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Session pool maintenance failed' },
        { status: 500 }
      )
    }
  }

  // Non-cron GET: return stats only
  const authError = verifyCronAuth(request)
  if (authError) return authError

  try {
    const poolStats = await getSessionPoolStats()
    return NextResponse.json({
      success: true,
      poolStats,
      currentTime: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[SessionPoolMaintenance] Status check failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get session pool status' },
      { status: 500 }
    )
  }
}
