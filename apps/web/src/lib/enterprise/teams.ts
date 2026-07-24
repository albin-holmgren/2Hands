/**
 * Workspace & RBAC
 *
 * Workspace model with role-based access control for shared agents.
 * Allows teams to collaborate on agent workflows while maintaining
 * security boundaries. Inspired by Lovable.dev collaboration model.
 *
 * Roles:
 *   - owner: Full control, billing, can delete workspace
 *   - admin: Manage members, agents, settings (no billing)
 *   - member: Create/run own agents, view shared agents
 *   - viewer: Read-only access to shared agents and analytics
 */

import { createAdminClient, createClient } from '@/lib/supabase/server'

// ============================================================
// Types
// ============================================================

export interface Workspace {
  id: string
  name: string
  slug: string
  ownerId: string
  plan: 'team' | 'business' | 'enterprise'
  settings: WorkspaceSettings
  avatarUrl: string | null
  description: string
  isPersonal: boolean
  memberCount: number
  agentCount: number
  credits?: number
  createdAt: string
  updatedAt: string
  ai_name?: string | null
}

export interface WorkspaceSettings {
  maxMembers: number
  maxAgents: number
  maxCreditsPerMonth: number
  allowMemberAgentCreation: boolean
  requireApprovalForAgentRuns: boolean
  sharedCreditsPool: boolean
  auditLogRetentionDays: number
}

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface WorkspaceMember {
  id: string
  workspaceId: string
  userId: string
  role: WorkspaceRole
  email: string
  displayName: string | null
  creditsUsed: number
  creditsUsedThisMonth: number
  joinedAt: string
  lastActiveAt: string | null
}

export interface WorkspaceInvite {
  id: string
  workspaceId: string
  email: string
  role: WorkspaceRole
  invitedBy: string
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

export interface SharedAgent {
  agentId: string
  workspaceId: string
  sharedBy: string
  visibility: 'workspace' | 'team' | 'private'
  permissions: AgentPermission[]
}

export type AgentPermission = 'view' | 'run' | 'edit' | 'delete'

// Keep legacy exports for backward compatibility during migration
export type OrgRole = WorkspaceRole
export type Organization = Workspace
export type OrgSettings = WorkspaceSettings
export type OrgMember = WorkspaceMember
export type OrgInvite = WorkspaceInvite

// Default settings per plan
const PLAN_DEFAULTS: Record<Workspace['plan'], WorkspaceSettings> = {
  team: {
    maxMembers: 5,
    maxAgents: 20,
    maxCreditsPerMonth: 5000,
    allowMemberAgentCreation: true,
    requireApprovalForAgentRuns: false,
    sharedCreditsPool: true,
    auditLogRetentionDays: 30,
  },
  business: {
    maxMembers: 25,
    maxAgents: 100,
    maxCreditsPerMonth: 25000,
    allowMemberAgentCreation: true,
    requireApprovalForAgentRuns: false,
    sharedCreditsPool: true,
    auditLogRetentionDays: 90,
  },
  enterprise: {
    maxMembers: 999,
    maxAgents: 999,
    maxCreditsPerMonth: 999999,
    allowMemberAgentCreation: true,
    requireApprovalForAgentRuns: false,
    sharedCreditsPool: true,
    auditLogRetentionDays: 365,
  },
}

// ============================================================
// Workspace CRUD
// ============================================================

export async function createWorkspace(
  ownerId: string,
  name: string,
  plan: Workspace['plan'] = 'team',
  isPersonal: boolean = false
): Promise<Workspace | null> {
  const supabase = await createClient()
  const id = crypto.randomUUID()
  const baseSlug = isPersonal
    ? `personal-${ownerId.replace(/-/g, '').slice(0, 16)}`
    : (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `workspace-${id.slice(0, 8)}`)
  const now = new Date().toISOString()
  const settings = PLAN_DEFAULTS[plan]
  let slug = baseSlug
  let workspaceInsertError: { code?: string } | null = null

  // Retry once with a deterministic suffix if the slug already exists.
  for (let attempt = 0; attempt < 2; attempt++) {
    const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${id.slice(0, 6)}`
    const { error } = await supabase
      .from('workspaces')
      .insert({
        id,
        name,
        slug: candidateSlug,
        owner_id: ownerId,
        plan,
        plan_type: 'free',
        is_personal: isPersonal,
        settings,
        credits_balance: 300,
        credits_reset_at: now,
        created_at: now,
        updated_at: now,
      } as never)

    if (!error) {
      slug = candidateSlug
      workspaceInsertError = null
      break
    }

    workspaceInsertError = error as { code?: string }
    if (workspaceInsertError.code !== '23505') break
  }

  if (workspaceInsertError) {
    console.error('[Workspace] Failed to create workspace:', workspaceInsertError)
    return null
  }

  // Add owner as first member. If RLS blocks this direct insert, fall back to admin client.
  const { error: memberInsertError } = await supabase.from('workspace_members').insert({
    id: crypto.randomUUID(),
    workspace_id: id,
    user_id: ownerId,
    role: 'owner',
    joined_at: now,
  } as never)

  if (memberInsertError) {
    console.warn('[Workspace] Owner membership insert blocked by RLS, retrying via admin client:', memberInsertError)

    try {
      const admin = createAdminClient()
      const { error: adminMemberInsertError } = await admin
        .from('workspace_members')
        .insert({
          id: crypto.randomUUID(),
          workspace_id: id,
          user_id: ownerId,
          role: 'owner',
          joined_at: now,
        } as never)

      if (adminMemberInsertError) {
        console.error('[Workspace] Failed to create owner membership via admin client:', adminMemberInsertError)
        return null
      }
    } catch (err) {
      console.error('[Workspace] Failed to initialize admin client for owner membership insert:', err)
      return null
    }
  }

  return {
    id,
    name,
    slug,
    ownerId,
    plan,
    settings,
    avatarUrl: null,
    description: '',
    isPersonal,
    memberCount: 1,
    agentCount: 0,
    credits: 300,
    createdAt: now,
    updatedAt: now,
  }
}

// Legacy alias
export const createOrganization = (ownerId: string, name: string, plan?: Workspace['plan']) =>
  createWorkspace(ownerId, name, plan)

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single()

  if (!error && data) return mapDbToWorkspace(data as Record<string, unknown>)

  // Fallback for environments where RLS policies are out-of-sync.
  // Route-level authorization still gates response payloads.
  try {
    const admin = createAdminClient()
    const { data: adminData, error: adminError } = await admin
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single()

    if (adminError || !adminData) return null
    return mapDbToWorkspace(adminData as Record<string, unknown>)
  } catch {
    return null
  }
}

// Legacy alias
export const getOrganization = getWorkspace

export async function getUserWorkspaces(userId: string): Promise<Workspace[]> {
  const supabase = await createClient()

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)

  const wsIds = (memberships as Array<{ workspace_id: string }> | null)?.map(m => m.workspace_id) || []

  if (wsIds.length > 0) {
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('*')
      .in('id', wsIds)
      .order('created_at', { ascending: false })

    if (workspaces && workspaces.length > 0) {
      return (workspaces as Array<Record<string, unknown>>).map(mapDbToWorkspace)
    }
  }

  // Fallback for RLS drift: resolve memberships/ownership with admin client and
  // self-heal missing owner membership rows.
  try {
    const admin = createAdminClient()

    const { data: adminMemberships } = await admin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)

    const { data: ownedWorkspaces } = await admin
      .from('workspaces')
      .select('id')
      .eq('owner_id', userId)

    const adminWsIds = new Set<string>()

    for (const membership of (adminMemberships as Array<{ workspace_id: string }> | null) || []) {
      adminWsIds.add(membership.workspace_id)
    }

    for (const ownedWorkspace of (ownedWorkspaces as Array<{ id: string }> | null) || []) {
      adminWsIds.add(ownedWorkspace.id)

      if (!adminMemberships?.some(m => (m as { workspace_id: string }).workspace_id === ownedWorkspace.id)) {
        await admin.from('workspace_members').insert({
          id: crypto.randomUUID(),
          workspace_id: ownedWorkspace.id,
          user_id: userId,
          role: 'owner',
          joined_at: new Date().toISOString(),
        } as never)
      }
    }

    if (adminWsIds.size === 0) return []

    const { data: adminWorkspaces } = await admin
      .from('workspaces')
      .select('*')
      .in('id', Array.from(adminWsIds))
      .order('created_at', { ascending: false })

    if (!adminWorkspaces) return []
    return (adminWorkspaces as Array<Record<string, unknown>>).map(mapDbToWorkspace)
  } catch {
    return []
  }
}

// Legacy alias
export const getUserOrganizations = getUserWorkspaces

export async function updateWorkspace(
  workspaceId: string,
  updates: { name?: string; description?: string; avatarUrl?: string | null }
): Promise<boolean> {
  const supabase = await createClient()

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.avatarUrl !== undefined) updateData.avatar_url = updates.avatarUrl

  const { data, error } = await supabase
    .from('workspaces')
    .update(updateData as never)
    .eq('id', workspaceId)
    .select('id')
    .maybeSingle()

  if (!error && data) return true

  // Fallback for RLS drift: only allow admin bypass if caller is the actual owner.
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const admin = createAdminClient()
    const { data: ownerWorkspace, error: ownerWorkspaceError } = await admin
      .from('workspaces')
      .select('owner_id')
      .eq('id', workspaceId)
      .single()

    if (ownerWorkspaceError || !ownerWorkspace) return false
    if ((ownerWorkspace as { owner_id?: string }).owner_id !== user.id) return false

    const { error: adminUpdateError } = await admin
      .from('workspaces')
      .update(updateData as never)
      .eq('id', workspaceId)

    return !adminUpdateError
  } catch {
    return false
  }
}

export async function ensurePersonalWorkspace(userId: string): Promise<Workspace | null> {
  const supabase = await createClient()

  // Check if user already has any workspace
  const workspaces = await getUserWorkspaces(userId)
  if (workspaces.length > 0) {
    const personal = workspaces.find(w => w.isPersonal)
    if (personal) return personal
    return workspaces[0]
  }

  // Call the SECURITY DEFINER RPC which bypasses RLS
  const { data: wsId, error: rpcError } = await (supabase.rpc as Function)(
    'ensure_personal_workspace',
    { p_user_id: userId }
  )

  if (rpcError) {
    console.error('[Workspace] RPC ensure_personal_workspace failed:', rpcError)
    return null
  }

  if (!wsId) return null

  // Try fetching through RLS first
  const ws = await getWorkspace(wsId as string)
  if (ws) return ws

  // RLS may block the read — build a minimal workspace object from what we know
  const { data: { user } } = await supabase.auth.getUser()
  const userName = user?.user_metadata?.full_name || user?.email || 'My Workspace'
  const now = new Date().toISOString()

  return {
    id: wsId as string,
    name: `${userName}'s Workspace`,
    slug: `personal-${userId.replace(/-/g, '').slice(0, 16)}`,
    ownerId: userId,
    plan: 'team',
    settings: PLAN_DEFAULTS.team,
    avatarUrl: null,
    description: '',
    isPersonal: true,
    memberCount: 1,
    agentCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

// ============================================================
// Member Management
// ============================================================

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      id, workspace_id, user_id, role, joined_at, last_active_at,
      credits_used, credits_used_this_month,
      profiles!inner(email, full_name)
    `)
    .eq('workspace_id', workspaceId)
    .order('joined_at', { ascending: true })

  if (error || !data) return []

  return (data as Array<Record<string, unknown>>).map(d => {
    const profile = d.profiles as Record<string, unknown> | null
    return {
      id: d.id as string,
      workspaceId: d.workspace_id as string,
      userId: d.user_id as string,
      role: d.role as WorkspaceRole,
      email: (profile?.email as string) || '',
      displayName: (profile?.full_name as string) || null,
      creditsUsed: (d.credits_used as number) || 0,
      creditsUsedThisMonth: (d.credits_used_this_month as number) || 0,
      joinedAt: d.joined_at as string,
      lastActiveAt: d.last_active_at as string | null,
    }
  })
}

// Legacy alias
export const getOrgMembers = getWorkspaceMembers

export async function inviteMember(
  workspaceId: string,
  invitedBy: string,
  email: string,
  role: WorkspaceRole = 'member'
): Promise<WorkspaceInvite | null> {
  const supabase = await createClient()

  // Check if user with this email is already a member (join profiles to match email)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (profile) {
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', (profile as { id: string }).id)
      .limit(1)

    if (existingMember && existingMember.length > 0) return null
  }

  // Check for pending invite with same email
  const { data: pendingInvite } = await supabase
    .from('workspace_invites')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('email', email)
    .is('accepted_at', null)
    .limit(1)

  if (pendingInvite && pendingInvite.length > 0) return null

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days

  const { error } = await supabase
    .from('workspace_invites')
    .insert({
      id,
      workspace_id: workspaceId,
      email,
      role,
      invited_by: invitedBy,
      expires_at: expiresAt,
      created_at: now,
    } as never)

  if (error) {
    console.error('[Workspace] Failed to create invite:', error)
    return null
  }

  return {
    id,
    workspaceId,
    email,
    role,
    invitedBy,
    expiresAt,
    acceptedAt: null,
    createdAt: now,
  }
}

export async function acceptInvite(inviteId: string, userId: string): Promise<boolean> {
  const supabase = await createClient()

  const { data: invite } = await supabase
    .from('workspace_invites')
    .select('*')
    .eq('id', inviteId)
    .is('accepted_at', null)
    .single()

  if (!invite) return false

  const inviteData = invite as { workspace_id: string; role: string; expires_at: string }

  // Check expiration
  if (new Date(inviteData.expires_at) < new Date()) return false

  // Add as member
  const { error: memberError } = await supabase
    .from('workspace_members')
    .insert({
      id: crypto.randomUUID(),
      workspace_id: inviteData.workspace_id,
      user_id: userId,
      role: inviteData.role,
      joined_at: new Date().toISOString(),
    } as never)

  if (memberError) return false

  // Mark invite as accepted
  await supabase
    .from('workspace_invites')
    .update({ accepted_at: new Date().toISOString() } as never)
    .eq('id', inviteId)

  return true
}

export async function removeMember(workspaceId: string, userId: string): Promise<boolean> {
  const supabase = await createClient()

  // Cannot remove the owner
  const { data: ws } = await supabase
    .from('workspaces')
    .select('owner_id')
    .eq('id', workspaceId)
    .single()

  if ((ws as { owner_id: string } | null)?.owner_id === userId) return false

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)

  return !error
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  newRole: WorkspaceRole,
  callerRole?: WorkspaceRole
): Promise<boolean> {
  const supabase = await createClient()

  // Cannot assign owner role via this function
  if (newRole === 'owner') return false

  // If caller role is provided, enforce hierarchy
  if (callerRole && callerRole !== 'owner') {
    // Admins can only set member/viewer roles, not promote to admin
    if (newRole === 'admin') return false

    // Admins cannot change other admins' roles
    const { data: target } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single()

    if ((target as { role: string } | null)?.role === 'admin') return false
  }

  const { error } = await supabase
    .from('workspace_members')
    .update({ role: newRole } as never)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)

  return !error
}

export async function leaveWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const supabase = await createClient()

  // Cannot leave if you're the owner
  const { data: ws } = await supabase
    .from('workspaces')
    .select('owner_id')
    .eq('id', workspaceId)
    .single()

  if ((ws as { owner_id: string } | null)?.owner_id === userId) return false

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)

  return !error
}

export async function deleteWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  // Use admin client for reliable ownership verification and deletion under RLS drift.
  const admin = createAdminClient()

  const { data: ws, error: wsError } = await admin
    .from('workspaces')
    .select('owner_id, is_personal')
    .eq('id', workspaceId)
    .single()

  const wsData = ws as { owner_id: string; is_personal: boolean } | null
  if (wsError || !wsData || wsData.owner_id !== userId) return false

  // Cannot delete personal workspace
  if (wsData.is_personal) return false

  // Delete all related data in order
  await admin.from('shared_agents').delete().eq('workspace_id', workspaceId)
  await admin.from('workspace_invites').delete().eq('workspace_id', workspaceId)
  await admin.from('workspace_members').delete().eq('workspace_id', workspaceId)
  await admin.from('audit_log').delete().eq('workspace_id', workspaceId)

  const { error } = await admin
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)

  return !error
}

export async function transferOwnership(
  workspaceId: string,
  currentOwnerId: string,
  newOwnerId: string
): Promise<boolean> {
  const supabase = await createClient()

  // Verify caller is the owner
  const { data: ws } = await supabase
    .from('workspaces')
    .select('owner_id')
    .eq('id', workspaceId)
    .single()

  if ((ws as { owner_id: string } | null)?.owner_id !== currentOwnerId) return false

  // Verify new owner is a member
  const { data: newOwnerMember } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', newOwnerId)
    .single()

  if (!newOwnerMember) return false

  // Update workspace owner
  const { error: wsErr } = await supabase
    .from('workspaces')
    .update({ owner_id: newOwnerId, updated_at: new Date().toISOString() } as never)
    .eq('id', workspaceId)

  if (wsErr) return false

  // Set new owner's role to 'owner'
  await supabase
    .from('workspace_members')
    .update({ role: 'owner' } as never)
    .eq('workspace_id', workspaceId)
    .eq('user_id', newOwnerId)

  // Demote old owner to admin
  await supabase
    .from('workspace_members')
    .update({ role: 'admin' } as never)
    .eq('workspace_id', workspaceId)
    .eq('user_id', currentOwnerId)

  return true
}

// ============================================================
// RBAC — Permission Checks
// ============================================================

export async function getUserRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()

  const membershipRole = (data as { role: WorkspaceRole } | null)?.role || null
  if (membershipRole === 'owner') return 'owner'
  if (membershipRole) {
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('owner_id')
      .eq('id', workspaceId)
      .single()

    if ((workspace as { owner_id?: string } | null)?.owner_id === userId) return 'owner'
    return membershipRole
  }

  const { data: ownerWorkspace } = await supabase
    .from('workspaces')
    .select('owner_id')
    .eq('id', workspaceId)
    .single()

  if ((ownerWorkspace as { owner_id?: string } | null)?.owner_id === userId) return 'owner'

  // Fallback: use admin client when RLS/policies hide membership rows for the caller.
  // This still checks only the current caller's userId and does not expose other users' roles.
  try {
    const admin = createAdminClient()

    const { data: adminWorkspace } = await admin
      .from('workspaces')
      .select('owner_id')
      .eq('id', workspaceId)
      .single()

    if ((adminWorkspace as { owner_id?: string } | null)?.owner_id === userId) {
      // Self-heal: ensure owner also has a membership row so user-scoped RLS reads work.
      const { data: ownerMembership } = await admin
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .limit(1)

      if (!ownerMembership || ownerMembership.length === 0) {
        await admin
          .from('workspace_members')
          .insert({
            id: crypto.randomUUID(),
            workspace_id: workspaceId,
            user_id: userId,
            role: 'owner',
            joined_at: new Date().toISOString(),
          } as never)
      }

      return 'owner'
    }

    const { data: adminMember } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single()

    const adminMembershipRole = (adminMember as { role?: WorkspaceRole } | null)?.role || null
    if (adminMembershipRole === 'owner') return 'owner'
    if (adminMembershipRole) return adminMembershipRole
  } catch {
    // Ignore admin fallback failures and keep null behavior.
  }

  return null
}

export function canManageMembers(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function canCreateAgents(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'member'
}

export function canRunAgents(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'member'
}

export function canEditAgent(role: WorkspaceRole, isCreator: boolean): boolean {
  if (role === 'owner' || role === 'admin') return true
  return role === 'member' && isCreator
}

export function canDeleteAgent(role: WorkspaceRole, isCreator: boolean): boolean {
  if (role === 'owner' || role === 'admin') return true
  return role === 'member' && isCreator
}

export function canAccessBilling(role: WorkspaceRole): boolean {
  return role === 'owner'
}

export function canManageSettings(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function canShareAgents(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'member'
}

// ============================================================
// Invite Queries
// ============================================================

export async function getPendingInvitesForUser(userEmail: string): Promise<WorkspaceInvite[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, email, role, invited_by, expires_at, accepted_at, created_at')
    .eq('email', userEmail)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return (data as Array<Record<string, unknown>>).map(d => ({
    id: d.id as string,
    workspaceId: d.workspace_id as string,
    email: d.email as string,
    role: d.role as WorkspaceRole,
    invitedBy: d.invited_by as string,
    expiresAt: d.expires_at as string,
    acceptedAt: null,
    createdAt: d.created_at as string,
  }))
}

export async function getWorkspaceInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, email, role, invited_by, expires_at, accepted_at, created_at')
    .eq('workspace_id', workspaceId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return (data as Array<Record<string, unknown>>).map(d => ({
    id: d.id as string,
    workspaceId: d.workspace_id as string,
    email: d.email as string,
    role: d.role as WorkspaceRole,
    invitedBy: d.invited_by as string,
    expiresAt: d.expires_at as string,
    acceptedAt: (d.accepted_at as string) || null,
    createdAt: d.created_at as string,
  }))
}

export async function declineInvite(inviteId: string): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('workspace_invites')
    .delete()
    .eq('id', inviteId)
    .is('accepted_at', null)

  return !error
}

// ============================================================
// Shared Agents
// ============================================================

export async function shareAgentWithWorkspace(
  agentId: string,
  workspaceId: string,
  sharedBy: string,
  visibility: 'workspace' | 'team' = 'workspace',
  permissions: AgentPermission[] = ['view', 'run']
): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('shared_agents')
    .upsert({
      agent_id: agentId,
      workspace_id: workspaceId,
      shared_by: sharedBy,
      visibility,
      permissions,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: 'agent_id,workspace_id' })

  return !error
}

// Legacy alias
export const shareAgentWithOrg = (agentId: string, workspaceId: string, sharedBy: string, visibility?: 'org' | 'team', permissions?: AgentPermission[]) =>
  shareAgentWithWorkspace(agentId, workspaceId, sharedBy, visibility === 'org' ? 'workspace' : (visibility || 'workspace'), permissions)

export async function getSharedAgents(workspaceId: string): Promise<(SharedAgent & { agentName: string; agentType: string })[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('shared_agents')
    .select(`
      agent_id, workspace_id, shared_by, visibility, permissions,
      agents!inner(name, type)
    `)
    .eq('workspace_id', workspaceId)

  if (error || !data) return []

  return (data as Array<Record<string, unknown>>).map(d => {
    const agent = d.agents as Record<string, unknown> | null
    return {
      agentId: d.agent_id as string,
      workspaceId: d.workspace_id as string,
      sharedBy: d.shared_by as string,
      visibility: d.visibility as 'workspace' | 'team' | 'private',
      permissions: d.permissions as AgentPermission[],
      agentName: (agent?.name as string) || 'Unknown Agent',
      agentType: (agent?.type as string) || 'general',
    }
  })
}

// ============================================================
// Audit Log
// ============================================================

export async function logAuditEvent(
  workspaceId: string,
  userId: string,
  action: string,
  resource: string,
  resourceId: string,
  details?: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient()

  try {
    await supabase.from('audit_log').insert({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      user_id: userId,
      action,
      resource,
      resource_id: resourceId,
      details: details || {},
      created_at: new Date().toISOString(),
    } as never)
  } catch (err) {
    console.error('[Audit] Failed to log event:', err)
  }
}

// ============================================================
// Helpers
// ============================================================

function mapDbToWorkspace(data: Record<string, unknown>): Workspace {
  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    ownerId: data.owner_id as string,
    plan: (data.plan as Workspace['plan']) || 'team',
    settings: (data.settings as WorkspaceSettings) || PLAN_DEFAULTS.team,
    avatarUrl: (data.avatar_url as string) || null,
    description: (data.description as string) || '',
    isPersonal: (data.is_personal as boolean) || false,
    memberCount: (data.member_count as number) || 0,
    agentCount: (data.agent_count as number) || 0,
    credits: data.credits_balance != null ? (data.credits_balance as number) : undefined,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    ai_name: (data.ai_name as string) || null,
  }
}
