/**
 * Binary image endpoint for VM screenshots
 * Returns actual JPEG bytes (not base64 JSON)
 * 
 * Usage: GET /api/agents/screenshot/image?agentId=...&v=...
 * 
 * The 'v' parameter is the etag - when it changes, client refetches
 * This enables proper HTTP caching and efficient updates
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { 
  getCachedScreenshot, 
  fetchAndCacheScreenshot 
} from '@/lib/screenshot-cache'
import { getAgentSession } from '@/lib/compute/session-manager'

export async function GET(request: NextRequest) {
  try {
    // Auth: Check Bearer token or cookies
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
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const requestedEtag = searchParams.get('v') // Version/etag from client

    if (!agentId) {
      return new NextResponse('Agent ID required', { status: 400 })
    }

    // Verify user owns this agent (admin client bypasses RLS SELECT drift)
    const adminDb = createAdminClient()
    const { data: agent, error: agentError } = await adminDb
      .from('agents')
      .select('id, vm_ip, status')
      .eq('id', agentId)
      .eq('user_id', user.id)
      .single()

    if (agentError || !agent) {
      return new NextResponse('Agent not found', { status: 404 })
    }

    const agentData = agent as { id: string; vm_ip: string | null; status: string }

    // Determine VM IP from session first, then agent record, then shared fallback
    let vmIp = agentData.vm_ip
    if (!vmIp) {
      const session = await getAgentSession(agentId)
      vmIp = session?.ipAddress || process.env.SHARED_VM_IP || process.env.VM_IP || null
    }

    vmIp = typeof vmIp === 'string' ? vmIp.trim() : vmIp
    
    if (!vmIp) {
      return new NextResponse('VM not available', { status: 503 })
    }

    // Try cache first
    let cached = getCachedScreenshot(agentId)
    
    // If cache miss or expired, fetch fresh
    if (!cached) {
      cached = await fetchAndCacheScreenshot(agentId, vmIp)
    }
    
    if (!cached) {
      return new NextResponse('Screenshot not available', { status: 503 })
    }

    // Always return the image bytes - expo-image needs actual data
    // The etag in URL is for cache busting (forces re-fetch when changed), not HTTP caching
    return new NextResponse(new Uint8Array(cached.data), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': cached.data.length.toString(),
        'ETag': cached.etag,
        'Cache-Control': 'no-cache', // Client should revalidate
        'X-Screenshot-Age': (Date.now() - cached.capturedAt).toString(),
      },
    })
  } catch (error) {
    console.error('[Screenshot Image] Error:', error)
    return new NextResponse('Internal error', { status: 500 })
  }
}
