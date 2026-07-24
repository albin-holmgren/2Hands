/**
 * Approval Workflow System for Agent Actions
 * 
 * Certain actions require human approval before execution.
 * This system queues actions and waits for user approval.
 */

import { createClient } from '@/lib/supabase/server'

export type ApprovalActionType = 
  | 'send_email'
  | 'post_publicly'
  | 'make_purchase'
  | 'delete_data'
  | 'financial_action'
  | 'modify_account'

export interface PendingApproval {
  id: string
  agent_id: string
  user_id: string
  action_type: ApprovalActionType
  action_details: {
    title: string
    description: string
    preview?: string // e.g., email draft content
    recipient?: string
    amount?: number
    currency?: string
    metadata?: Record<string, unknown>
  }
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  created_at: string
  expires_at: string
  decided_at?: string
  decided_by?: string
}

/**
 * Create a pending approval request
 */
export async function requestApproval(
  agentId: string,
  userId: string,
  actionType: ApprovalActionType,
  details: PendingApproval['action_details']
): Promise<{ approvalId: string; message: string }> {
  const supabase = await createClient()
  
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 24) // Expires in 24 hours
  
  const { data, error } = await supabase
    .from('agent_approvals')
    .insert({
      agent_id: agentId,
      user_id: userId,
      action_type: actionType,
      action_details: details,
      status: 'pending',
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    } as never)
    .select()
    .single()
  
  if (error || !data) {
    console.error('Failed to create approval request:', error)
    throw new Error('Failed to create approval request')
  }
  
  const approval = data as { id: string }
  
  return {
    approvalId: approval.id,
    message: `Action requires approval. I've prepared: "${details.title}". Please review and approve in the 2Hands dashboard.`
  }
}

/**
 * Check if an action requires approval
 */
export function requiresApproval(
  actionType: string,
  requiredApprovals: ApprovalActionType[]
): boolean {
  return requiredApprovals.includes(actionType as ApprovalActionType)
}

/**
 * Get pending approvals for a user
 */
export async function getPendingApprovals(userId: string): Promise<PendingApproval[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('agent_approvals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Failed to get pending approvals:', error)
    return []
  }
  
  return (data || []) as PendingApproval[]
}

/**
 * Approve an action
 */
export async function approveAction(
  approvalId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('agent_approvals')
    .update({
      status: 'approved',
      decided_at: new Date().toISOString(),
      decided_by: userId,
    } as never)
    .eq('id', approvalId)
    .eq('user_id', userId)
    .eq('status', 'pending')
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Reject an action
 */
export async function rejectAction(
  approvalId: string,
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('agent_approvals')
    .update({
      status: 'rejected',
      decided_at: new Date().toISOString(),
      decided_by: userId,
      action_details: { rejection_reason: reason },
    } as never)
    .eq('id', approvalId)
    .eq('user_id', userId)
    .eq('status', 'pending')
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Check if an approval was granted (for agent to continue)
 */
export async function checkApprovalStatus(
  approvalId: string
): Promise<'pending' | 'approved' | 'rejected' | 'expired' | 'not_found'> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('agent_approvals')
    .select('status, expires_at')
    .eq('id', approvalId)
    .single()
  
  if (error || !data) {
    return 'not_found'
  }
  
  const approval = data as { status: string; expires_at: string }
  
  // Check if expired
  if (approval.status === 'pending' && new Date(approval.expires_at) < new Date()) {
    // Mark as expired
    await supabase
      .from('agent_approvals')
      .update({ status: 'expired' } as never)
      .eq('id', approvalId)
    return 'expired'
  }
  
  return approval.status as 'pending' | 'approved' | 'rejected'
}

/**
 * Generate human-readable action descriptions
 */
export function describeAction(actionType: ApprovalActionType): string {
  const descriptions: Record<ApprovalActionType, string> = {
    send_email: '📧 Send Email',
    post_publicly: '📢 Post to Social Media',
    make_purchase: '🛒 Make Purchase',
    delete_data: '🗑️ Delete Data',
    financial_action: '💰 Financial Transaction',
    modify_account: '⚙️ Modify Account Settings',
  }
  return descriptions[actionType] || actionType
}

/**
 * Get risk level for action type
 */
export function getActionRiskLevel(actionType: ApprovalActionType): 'low' | 'medium' | 'high' {
  const riskLevels: Record<ApprovalActionType, 'low' | 'medium' | 'high'> = {
    send_email: 'medium',
    post_publicly: 'medium',
    make_purchase: 'high',
    delete_data: 'high',
    financial_action: 'high',
    modify_account: 'medium',
  }
  return riskLevels[actionType] || 'medium'
}
