import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createWorkspace,
  getUserWorkspaces,
  getWorkspace,
  getWorkspaceMembers,
  updateWorkspace,
  ensurePersonalWorkspace,
  inviteMember,
  acceptInvite,
  removeMember,
  updateMemberRole,
  leaveWorkspace,
  deleteWorkspace,
  transferOwnership,
  getUserRole,
  canManageMembers,
  canShareAgents,
  shareAgentWithWorkspace,
  getSharedAgents,
  getPendingInvitesForUser,
  getWorkspaceInvites,
  declineInvite,
  logAuditEvent,
  type WorkspaceRole,
  type AgentPermission,
} from '@/lib/enterprise/teams'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId') || searchParams.get('orgId')
  const action = searchParams.get('action')

  // Audit log (finds user's first workspace automatically)
  if (action === 'audit-log') {
    const workspaces = await getUserWorkspaces(user.id)
    if (!workspaces.length) return NextResponse.json({ entries: [] })
    const firstWs = workspaces[0]
    const callerRole = await getUserRole(firstWs.id, user.id)
    if (!callerRole || (callerRole !== 'owner' && callerRole !== 'admin')) {
      return NextResponse.json({ error: 'Only admins can view audit log' }, { status: 403 })
    }
    const pageNum = parseInt(searchParams.get('page') || '0', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100)
    const { data } = await supabase
      .from('audit_log')
      .select('id, user_id, action, resource, resource_id, details, created_at')
      .eq('workspace_id', firstWs.id)
      .order('created_at', { ascending: false })
      .range(pageNum * limit, (pageNum + 1) * limit - 1)
    const entries = ((data || []) as Array<Record<string, unknown>>).map(e => ({
      id: e.id,
      userId: e.user_id,
      userEmail: null,
      action: e.action,
      resource: e.resource,
      resourceId: e.resource_id,
      details: (e.details as Record<string, unknown>) || {},
      createdAt: e.created_at,
    }))
    return NextResponse.json({ entries })
  }

  // Pending invites for current user
  if (action === 'pending-invites') {
    const invites = await getPendingInvitesForUser(user.email!)
    return NextResponse.json({ invites })
  }

  // List user's workspaces
  if (!workspaceId) {
    const workspaces = await getUserWorkspaces(user.id)
    return NextResponse.json({ workspaces, organizations: workspaces })
  }

  // Get specific workspace details
  const workspace = await getWorkspace(workspaceId)
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  // Check membership
  const role = await getUserRole(workspaceId, user.id)
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  if (action === 'members') {
    const members = await getWorkspaceMembers(workspaceId)
    return NextResponse.json({ members })
  }

  if (action === 'shared-agents') {
    const agents = await getSharedAgents(workspaceId)
    return NextResponse.json({ agents })
  }

  if (action === 'invites') {
    const callerRole = await getUserRole(workspaceId, user.id)
    if (!callerRole || !canManageMembers(callerRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    const invites = await getWorkspaceInvites(workspaceId)
    return NextResponse.json({ invites })
  }

  return NextResponse.json({ workspace, organization: workspace, role })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    action: string
    name?: string
    description?: string
    avatarUrl?: string | null
    plan?: 'team' | 'business' | 'enterprise'
    workspaceId?: string
    orgId?: string
    email?: string
    role?: WorkspaceRole
    userId?: string
    newOwnerId?: string
    inviteId?: string
    agentId?: string
    visibility?: 'workspace' | 'team'
    permissions?: AgentPermission[]
    deleteConfirmation?: string
  }

  // Support both workspaceId and orgId for backward compatibility
  const wsId = body.workspaceId || body.orgId
  const normalizeConfirmation = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

  switch (body.action) {
    case 'create_workspace':
    case 'create_org': {
      if (!body.name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
      const workspace = await createWorkspace(user.id, body.name, body.plan || 'team')
      if (!workspace) return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
      // Return updated workspace list to ensure client has fresh data
      const updatedWorkspaces = await getUserWorkspaces(user.id)
      const workspaces = updatedWorkspaces.some(w => w.id === workspace.id)
        ? updatedWorkspaces
        : [workspace, ...updatedWorkspaces]
      return NextResponse.json({ workspace, organization: workspace, workspaces }, { status: 201 })
    }

    case 'update_workspace': {
      if (!wsId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
      const role = await getUserRole(wsId, user.id)
      if (!role) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
      // Keep API behavior aligned with DB RLS policy (owner-managed workspace settings).
      if (role !== 'owner') {
        return NextResponse.json({ error: 'Only the workspace owner can update workspace settings' }, { status: 403 })
      }
      const updated = await updateWorkspace(wsId, {
        name: body.name,
        description: body.description,
        avatarUrl: body.avatarUrl,
      })
      if (!updated) return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 })
      // Return fresh workspace data
      const freshWorkspace = await getWorkspace(wsId)
      await logAuditEvent(wsId, user.id, 'update_workspace', 'workspaces', wsId, { name: body.name, description: body.description })
      return NextResponse.json({ success: true, workspace: freshWorkspace })
    }

    case 'ensure_personal_workspace': {
      const workspace = await ensurePersonalWorkspace(user.id)
      if (!workspace) return NextResponse.json({ error: 'Failed to create personal workspace' }, { status: 500 })
      return NextResponse.json({ workspace, organization: workspace })
    }

    case 'invite_member': {
      if (!wsId || !body.email) {
        return NextResponse.json({ error: 'workspaceId and email required' }, { status: 400 })
      }
      const role = await getUserRole(wsId, user.id)
      if (!role || !canManageMembers(role)) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
      const invite = await inviteMember(wsId, user.id, body.email, body.role || 'member')
      if (!invite) return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
      await logAuditEvent(wsId, user.id, 'invite_member', 'workspace_invites', invite.id, { email: body.email, role: body.role })
      return NextResponse.json({ invite }, { status: 201 })
    }

    case 'accept_invite': {
      if (!body.inviteId) return NextResponse.json({ error: 'inviteId required' }, { status: 400 })
      const accepted = await acceptInvite(body.inviteId, user.id)
      if (!accepted) return NextResponse.json({ error: 'Failed to accept invite' }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    case 'remove_member': {
      if (!wsId || !body.userId) {
        return NextResponse.json({ error: 'workspaceId and userId required' }, { status: 400 })
      }
      const role = await getUserRole(wsId, user.id)
      if (!role || !canManageMembers(role)) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
      const removed = await removeMember(wsId, body.userId)
      if (!removed) return NextResponse.json({ error: 'Cannot remove this member' }, { status: 400 })
      await logAuditEvent(wsId, user.id, 'remove_member', 'workspace_members', body.userId)
      return NextResponse.json({ success: true })
    }

    case 'update_role': {
      if (!wsId || !body.userId || !body.role) {
        return NextResponse.json({ error: 'workspaceId, userId, and role required' }, { status: 400 })
      }
      const callerRole = await getUserRole(wsId, user.id)
      if (!callerRole || !canManageMembers(callerRole)) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
      const updated = await updateMemberRole(wsId, body.userId, body.role, callerRole)
      if (!updated) return NextResponse.json({ error: 'Failed to update role' }, { status: 400 })
      await logAuditEvent(wsId, user.id, 'update_role', 'workspace_members', body.userId, { newRole: body.role })
      return NextResponse.json({ success: true })
    }

    case 'leave_workspace': {
      if (!wsId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
      const left = await leaveWorkspace(wsId, user.id)
      if (!left) return NextResponse.json({ error: 'Cannot leave workspace (owners must transfer ownership first)' }, { status: 400 })
      await logAuditEvent(wsId, user.id, 'leave_workspace', 'workspace_members', user.id)
      return NextResponse.json({ success: true })
    }

    case 'delete_workspace': {
      if (!wsId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
      const role = await getUserRole(wsId, user.id)
      if (role !== 'owner') {
        return NextResponse.json({ error: 'Only the owner can delete a non-personal workspace' }, { status: 403 })
      }

      const workspace = await getWorkspace(wsId)
      if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

      const expectedConfirmation = `DELETE ${workspace.name}`
      const confirmation = (body.deleteConfirmation || '').trim()
      if (normalizeConfirmation(confirmation) !== normalizeConfirmation(expectedConfirmation)) {
        return NextResponse.json({ error: `Type "${expectedConfirmation}" to confirm deletion` }, { status: 400 })
      }

      const deleted = await deleteWorkspace(wsId, user.id)
      if (!deleted) return NextResponse.json({ error: 'Only the owner can delete a non-personal workspace' }, { status: 403 })
      return NextResponse.json({ success: true })
    }

    case 'transfer_ownership': {
      if (!wsId || !body.newOwnerId) {
        return NextResponse.json({ error: 'workspaceId and newOwnerId required' }, { status: 400 })
      }
      const transferred = await transferOwnership(wsId, user.id, body.newOwnerId)
      if (!transferred) return NextResponse.json({ error: 'Failed to transfer ownership' }, { status: 400 })
      await logAuditEvent(wsId, user.id, 'transfer_ownership', 'workspaces', wsId, { newOwnerId: body.newOwnerId })
      return NextResponse.json({ success: true })
    }

    case 'decline_invite': {
      if (!body.inviteId) return NextResponse.json({ error: 'inviteId required' }, { status: 400 })
      const declined = await declineInvite(body.inviteId)
      if (!declined) return NextResponse.json({ error: 'Failed to decline invite' }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    case 'share_agent': {
      if (!wsId || !body.agentId) {
        return NextResponse.json({ error: 'workspaceId and agentId required' }, { status: 400 })
      }
      const role = await getUserRole(wsId, user.id)
      if (!role || !canShareAgents(role)) {
        return NextResponse.json({ error: 'Viewers cannot share agents' }, { status: 403 })
      }
      const shared = await shareAgentWithWorkspace(
        body.agentId,
        wsId,
        user.id,
        body.visibility || 'workspace',
        body.permissions || ['view', 'run']
      )
      if (!shared) return NextResponse.json({ error: 'Failed to share agent' }, { status: 500 })
      await logAuditEvent(wsId, user.id, 'share_agent', 'shared_agents', body.agentId)
      return NextResponse.json({ success: true })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
