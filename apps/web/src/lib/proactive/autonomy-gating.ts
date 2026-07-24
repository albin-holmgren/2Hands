/**
 * Autonomy Gating System
 *
 * @note PARTIALLY DORMANT — checkApprovalNeeded() is defined here but has no
 * callers in the live agent execution path.
 *
 * LIVE functions (called from chat/route.ts):
 *   - processApprovalResponse() — fire-and-forget; handles "approve"/"reject" user replies
 *
 * DORMANT functions (not wired into any live path):
 *   - checkApprovalNeeded() — intended gate before agent tool execution; no callers
 *
 * The authoritative runtime classification and risk logic is now in:
 *   src/lib/execution/execute-first-policy.ts
 *   → classifyExecution()      — direct_execute / background_agent / needs_confirmation
 *   → diagnoseIntegrationError() — attempt → diagnose → retry
 *
 * Do NOT add new gating logic here. Extend execute-first-policy.ts instead.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { notifyApprovalNeeded } from '@/lib/notifications/push-notifications'
import { assessConfidence, type ActionContext } from './confidence-autonomy'

export interface PendingApproval {
  id: string
  agentId: string
  userId: string
  runId: string
  actionType: string
  actionDescription: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  confidence: number
  context: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  createdAt: string
  expiresAt: string
  respondedAt: string | null
}

export interface ApprovalResult {
  needsApproval: boolean
  approvalId?: string
  reason?: string
  canProceed: boolean
}

// Actions that always need approval regardless of confidence
const ALWAYS_ASK_ACTIONS = [
  'delete_data',
  'send_payment',
  'change_password',
  'delete_account',
  'post_public',
  'send_bulk_email',
]

// Actions that never need approval
const NEVER_ASK_ACTIONS = [
  'screenshot',
  'read_page',
  'scroll',
  'navigate',
  'search',
]

/**
 * Check if an action needs approval and create approval record if so
 */
export async function checkApprovalNeeded(
  agentId: string,
  userId: string,
  runId: string,
  action: ActionContext
): Promise<ApprovalResult> {
  const supabase = createAdminClient()
  
  // Never ask for safe actions
  if (NEVER_ASK_ACTIONS.includes(action.actionType)) {
    return { needsApproval: false, canProceed: true }
  }
  
  // Always ask for critical actions
  if (ALWAYS_ASK_ACTIONS.includes(action.actionType)) {
    const approvalId = await createApprovalRequest(
      agentId, userId, runId, action, 'critical', 0
    )
    return {
      needsApproval: true,
      approvalId,
      reason: `${action.actionType} always requires approval`,
      canProceed: false,
    }
  }
  
  // Assess confidence for other actions
  const assessment = assessConfidence(action)
  
  if (!assessment.shouldAskApproval) {
    return { needsApproval: false, canProceed: true }
  }
  
  // Create approval request
  const approvalId = await createApprovalRequest(
    agentId, userId, runId, action, assessment.riskLevel, assessment.overallConfidence
  )
  
  return {
    needsApproval: true,
    approvalId,
    reason: assessment.reasoning,
    canProceed: false,
  }
}

/**
 * Create a pending approval record and notify user
 */
async function createApprovalRequest(
  agentId: string,
  userId: string,
  runId: string,
  action: ActionContext,
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
  confidence: number
): Promise<string> {
  const supabase = createAdminClient()
  const id = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  
  // Expires in 1 hour for high/critical, 24 hours for lower risk
  const expiresInMs = riskLevel === 'high' || riskLevel === 'critical' 
    ? 60 * 60 * 1000 
    : 24 * 60 * 60 * 1000
  
  await supabase
    .from('agent_pending_approvals')
    .insert({
      id,
      agent_id: agentId,
      user_id: userId,
      run_id: runId,
      action_type: action.actionType,
      action_description: action.description,
      risk_level: riskLevel,
      confidence,
      context: action as unknown as Record<string, unknown>,
      status: 'pending',
      expires_at: new Date(Date.now() + expiresInMs).toISOString(),
      created_at: new Date().toISOString(),
    } as never)
  
  // Get agent name for notification
  const { data: agent } = await supabase
    .from('agents')
    .select('name')
    .eq('id', agentId)
    .single()
  
  const agentName = (agent as { name: string } | null)?.name || 'Agent'
  
  // Send push notification
  await notifyApprovalNeeded(userId, agentName, action.description)
  
  // Also insert message into AI Manager conversation
  await insertApprovalMessage(userId, agentName, action, id)
  
  return id
}

/**
 * Insert approval request as AI Manager message
 */
async function insertApprovalMessage(
  userId: string,
  agentName: string,
  action: ActionContext,
  approvalId: string
): Promise<void> {
  const supabase = createAdminClient()
  
  // Get AI Manager conversation
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('title', 'AI Manager')
    .single()
  
  if (!conversation) return
  
  const message = `**${agentName} needs your approval**

${action.description}

**Risk level:** ${action.actionType.includes('delete') ? 'High' : 'Medium'}
**Action:** ${action.actionType}

Reply with "approve" or "reject" to respond.`
  
  await supabase
    .from('messages')
    .insert({
      conversation_id: (conversation as { id: string }).id,
      role: 'assistant',
      content: message,
      metadata: { 
        type: 'approval_request',
        approval_id: approvalId,
        agent_name: agentName,
      },
    } as never)
}

/**
 * Process user's approval response
 */
export async function processApprovalResponse(
  userId: string,
  message: string
): Promise<{ processed: boolean; approvalId?: string; action?: 'approved' | 'rejected' }> {
  const supabase = createAdminClient()
  const lowerMessage = message.toLowerCase().trim()
  
  // Check for approval keywords
  const isApproval = ['approve', 'yes', 'ok', 'go ahead', 'proceed', 'do it'].some(
    keyword => lowerMessage.includes(keyword)
  )
  const isRejection = ['reject', 'no', 'cancel', 'stop', 'don\'t', 'dont'].some(
    keyword => lowerMessage.includes(keyword)
  )
  
  if (!isApproval && !isRejection) {
    return { processed: false }
  }
  
  // Get most recent pending approval for this user
  const { data: approval } = await supabase
    .from('agent_pending_approvals')
    .select('id, agent_id, run_id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  if (!approval) {
    return { processed: false }
  }
  
  const approvalData = approval as { id: string; agent_id: string; run_id: string }
  const action = isApproval ? 'approved' : 'rejected'
  
  // Update approval status
  await supabase
    .from('agent_pending_approvals')
    .update({
      status: action,
      responded_at: new Date().toISOString(),
    } as never)
    .eq('id', approvalData.id)
  
  // If approved, trigger agent resume
  if (action === 'approved') {
    await resumeAgent(approvalData.agent_id, approvalData.run_id)
  }
  
  return { processed: true, approvalId: approvalData.id, action }
}

/**
 * Resume a paused agent after approval
 */
async function resumeAgent(agentId: string, runId: string): Promise<void> {
  const supabase = createAdminClient()
  
  // Update agent status to allow it to continue
  await supabase
    .from('agents')
    .update({
      status: 'working',
      config: supabase.rpc('jsonb_set_lax' as never, {
        target: 'config',
        path: '{approval_granted}',
        value: 'true',
      } as never),
    } as never)
    .eq('id', agentId)
  
  // Note: The actual resume logic would be handled by the agent executor
  // checking for approval status before proceeding
}

/**
 * Check if agent has pending approval
 */
export async function hasPendingApproval(
  agentId: string,
  runId: string
): Promise<PendingApproval | null> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('agent_pending_approvals')
    .select('*')
    .eq('agent_id', agentId)
    .eq('run_id', runId)
    .eq('status', 'pending')
    .single()
  
  if (!data) return null
  
  const d = data as {
    id: string
    agent_id: string
    user_id: string
    run_id: string
    action_type: string
    action_description: string
    risk_level: 'low' | 'medium' | 'high' | 'critical'
    confidence: number
    context: Record<string, unknown>
    status: 'pending' | 'approved' | 'rejected' | 'expired'
    created_at: string
    expires_at: string
    responded_at: string | null
  }
  
  return {
    id: d.id,
    agentId: d.agent_id,
    userId: d.user_id,
    runId: d.run_id,
    actionType: d.action_type,
    actionDescription: d.action_description,
    riskLevel: d.risk_level,
    confidence: d.confidence,
    context: d.context,
    status: d.status,
    createdAt: d.created_at,
    expiresAt: d.expires_at,
    respondedAt: d.responded_at,
  }
}

/**
 * Check if approval was granted for a pending action
 */
export async function checkApprovalStatus(
  approvalId: string
): Promise<'pending' | 'approved' | 'rejected' | 'expired'> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('agent_pending_approvals')
    .select('status, expires_at')
    .eq('id', approvalId)
    .single()
  
  if (!data) return 'expired'
  
  const approval = data as { status: string; expires_at: string }
  
  // Check if expired
  if (approval.status === 'pending' && new Date(approval.expires_at) < new Date()) {
    // Mark as expired
    await supabase
      .from('agent_pending_approvals')
      .update({ status: 'expired' } as never)
      .eq('id', approvalId)
    return 'expired'
  }
  
  return approval.status as 'pending' | 'approved' | 'rejected' | 'expired'
}

/**
 * Expire old pending approvals (called by cron)
 */
export async function expireOldApprovals(): Promise<number> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('agent_pending_approvals')
    .update({ status: 'expired' } as never)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select('id')
  
  return data?.length || 0
}
