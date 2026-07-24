import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAgentSession } from '@/lib/compute/session-manager'

function signVmBody(body: string): string {
  const secret = (process.env.VM_SECRET || '').trim()
  if (!secret) return ''
  return createHmac('sha256', secret).update(body).digest('hex')
}

export async function GET(request: NextRequest) {
  try {
    // Check for Bearer token (mobile) or cookies (web)
    const authHeader = request.headers.get('Authorization')
    let supabase = await createClient()
    let user = null
    
    if (authHeader?.startsWith('Bearer ')) {
      // Mobile auth - use token directly
      const token = authHeader.substring(7)
      const { createClient: createBrowserClient } = await import('@supabase/supabase-js')
      const supabaseWithToken = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        }
      )
      const { data: { user: tokenUser }, error } = await supabaseWithToken.auth.getUser(token)
      if (!error && tokenUser) {
        user = tokenUser
        supabase = supabaseWithToken
      }
    } else {
      // Web auth - use cookies
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

    const adminDb = createAdminClient()
    const { data: agent, error: agentError } = await adminDb
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .eq('user_id', user.id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const agentData = agent as { 
      id: string
      name: string
      vm_ip: string | null
      status: string
      last_active: string | null
      next_run_at: string | null
      last_run_at: string | null
      schedule_type: string
      schedule_cron: string | null
      schedule_timezone: string
      config: { last_screenshot?: string; description?: string; execution_started?: boolean; last_retry_at?: string }
    }

    console.log('[Screenshot] Agent:', agentData.id, 'status:', agentData.status, 'vm_ip:', agentData.vm_ip)

    let vmIp = agentData.vm_ip

    const resetExecution = searchParams.get('reset') === 'true'
    
    // Check if we should force show VM
    // - force=true: mobile app is actively displaying VM (user wants to see it)
    // - reset=true: user just triggered a run
    // - recent run: within 2 minutes of last run
    // - working/initializing status
    const forceShow = searchParams.get('force') === 'true'
    const recentRun = agentData.last_run_at && 
      Date.now() - new Date(agentData.last_run_at).getTime() < 120000 // Within 2 minutes
    const shouldShowVM = forceShow || resetExecution || recentRun || 
      agentData.status === 'working' || agentData.status === 'initializing'
    
    // If no vm_ip on agent but should show VM, try to get from agent's session
    if (!vmIp && shouldShowVM) {
      const session = await getAgentSession(agentId)
      if (session?.ipAddress) {
        console.log('[Screenshot] Using session IP:', session.ipAddress, 'sessionId:', session.id)
        vmIp = session.ipAddress
      } else {
        // Fallback to SHARED_VM_IP only during migration period
        const sharedVmIp = process.env.SHARED_VM_IP || process.env.VM_IP
        if (sharedVmIp) {
          console.log('[Screenshot] Fallback to VM_IP:', sharedVmIp)
          vmIp = sharedVmIp
        }
      }
    }

    vmIp = typeof vmIp === 'string' ? vmIp.trim() : vmIp

    // When agent is actively working or force=true, ALWAYS fetch fresh from VM
    // This ensures we see live updates, not stale cached frames
    const isAgentActive = agentData.status === 'working' || agentData.status === 'initializing'
    
    if (vmIp && (isAgentActive || forceShow)) {
      console.log('[Screenshot] Fetching FRESH from VM:', vmIp, 'active:', isAgentActive, 'force:', forceShow)
      try {
        const ip = vmIp.trim()
        const vmBody = JSON.stringify({ action: 'screenshot' })
        const vmSig = signVmBody(vmBody)
        const response = await fetch(`http://${ip}:8080/computer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(vmSig ? { 'X-Signature': vmSig } : {}),
          },
          body: vmBody,
          signal: AbortSignal.timeout(5000), // 5s timeout
        })

        if (response.ok) {
          const result = await response.json()
          const screenshotData = result.data || result.screenshot
          if (screenshotData) {
            console.log('[Screenshot] Got fresh frame from VM, length:', screenshotData.length)
            return NextResponse.json({
              screenshot: screenshotData,
              status: agentData.status,
              next_run_at: agentData.next_run_at,
              last_run_at: agentData.last_run_at,
              schedule_type: agentData.schedule_type,
              source: 'live_vm',
            })
          }
        }
      } catch (err) {
        console.log('[Screenshot] VM fetch failed, falling back to cached:', err)
      }
    }

    // Fallback: Use cached screenshot from agent executor (what agent last saw)
    if (agentData.config?.last_screenshot) {
      console.log('[Screenshot] Using cached screenshot from agent executor')
      return NextResponse.json({
        screenshot: agentData.config.last_screenshot,
        status: agentData.status,
        next_run_at: agentData.next_run_at,
        last_run_at: agentData.last_run_at,
        schedule_type: agentData.schedule_type,
        source: 'cached',
      })
    }

    // Last resort: Try VM even if not "active"
    if (vmIp) {
      try {
        const ip = vmIp.trim()
        const vmBody2 = JSON.stringify({ action: 'screenshot' })
        const vmSig2 = signVmBody(vmBody2)
        const response = await fetch(`http://${ip}:8080/computer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(vmSig2 ? { 'X-Signature': vmSig2 } : {}),
          },
          body: vmBody2,
          signal: AbortSignal.timeout(5000),
        })

        if (response.ok) {
          const result = await response.json()
          const screenshotData2 = result.data || result.screenshot
          if (screenshotData2) {
            return NextResponse.json({
              screenshot: screenshotData2,
              status: agentData.status,
              next_run_at: agentData.next_run_at,
              last_run_at: agentData.last_run_at,
              schedule_type: agentData.schedule_type,
              source: 'vm_fallback',
            })
          }
        }
      } catch {
        // VM not responding
      }
    }

    console.log('[Screenshot] No screenshot available for agent:', agentData.id)
    return NextResponse.json({
      screenshot: null,
      status: agentData.status,
      next_run_at: agentData.next_run_at,
      last_run_at: agentData.last_run_at,
      schedule_type: agentData.schedule_type,
      message: 'Screenshot not available',
    })
  } catch (error) {
    console.error('Screenshot fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch screenshot' },
      { status: 500 }
    )
  }
}
