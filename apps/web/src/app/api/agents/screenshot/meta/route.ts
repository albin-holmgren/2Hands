/**
 * Screenshot meta endpoint - returns etag/status without the actual image
 * Mobile polls this frequently, only fetches image when etag changes
 * 
 * Usage: GET /api/agents/screenshot/meta?agentId=...
 * Returns: { etag, status, updatedAt }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedEtag, fetchAndCacheScreenshot } from '@/lib/screenshot-cache'
import { getAgentSession } from '@/lib/compute/session-manager'

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const authHeader = request.headers.get('Authorization')
    let supabase = await createClient()
    let user = null
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const { createClient: createBrowserClient } = await import('@supabase/supabase-js')
      const supabaseWithToken = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: { Authorization: `Bearer ${token}` },
          },
        }
      )
      const { data: { user: tokenUser }, error } = await supabaseWithToken.auth.getUser(token)
      if (!error && tokenUser) {
        user = tokenUser
        supabase = supabaseWithToken
      }
    } else {
      const { data: { user: cookieUser }, error } = await supabase.auth.getUser()
      if (!error) user = cookieUser
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')

    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID required' }, { status: 400 })
    }

    // Get agent info (admin client bypasses RLS SELECT drift)
    const adminDb = createAdminClient()
    const { data: agent, error: agentError } = await adminDb
      .from('agents')
      .select('id, vm_ip, status, name, config')
      .eq('id', agentId)
      .eq('user_id', user.id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const agentData = agent as { id: string; vm_ip: string | null; status: string; name: string; config: Record<string, unknown> | null }
    
    // Get VM IP from session first, then agent record, then fallback to shared
    let vmIp = agentData.vm_ip
    if (!vmIp) {
      const session = await getAgentSession(agentId)
      vmIp = session?.ipAddress || process.env.SHARED_VM_IP || process.env.VM_IP || null
    }

    vmIp = typeof vmIp === 'string' ? vmIp.trim() : vmIp
    const isAgentActive = agentData.status === 'working' || agentData.status === 'initializing'
    
    // Always fetch fresh screenshot when agent is actively working
    // This ensures the mobile app sees real-time updates
    let etag = null
    if (vmIp && isAgentActive) {
      // Always fetch fresh when working - the cache TTL handles rate limiting
      const cached = await fetchAndCacheScreenshot(agentId, vmIp)
      etag = cached?.etag || null
    } else {
      // Agent not active - just return cached etag if any
      etag = getCachedEtag(agentId)
    }

    return NextResponse.json({
      etag,
      status: agentData.status,
      vmAvailable: !!vmIp,
      updatedAt: Date.now(),
    })
  } catch (error) {
    console.error('[Screenshot Meta] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
