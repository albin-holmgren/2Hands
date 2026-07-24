'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, Plus, Search, Loader2, Trash2, UserPlus,
  Bot, Globe, Database, FileSearch, Mail, ChevronUp, ChevronDown,
  MoreHorizontal, Pencil, LogOut, ArrowRightLeft, Check, X
} from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspaceStore, type WorkspaceInfo } from '@/store/workspace-store'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'

// ============================================================
// Types
// ============================================================

interface Workspace {
  id: string
  name: string
  slug: string
  plan: string
  isPersonal: boolean
  description: string
  avatarUrl: string | null
  memberCount: number
  agentCount: number
  credits?: number
  createdAt: string
}

interface WorkspaceMember {
  id: string
  userId: string
  role: string
  email: string
  displayName: string | null
  creditsUsed: number
  creditsUsedThisMonth: number
  joinedAt: string
}

type SortField = 'name' | 'role' | 'joinedAt' | 'creditsUsedThisMonth' | 'creditsUsed'
type SortDir = 'asc' | 'desc'
type Tab = 'all' | 'invitations' | 'agents'

function toWorkspaceInfo(ws: Workspace): WorkspaceInfo {
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    plan: ws.plan,
    isPersonal: ws.isPersonal,
    description: ws.description,
    avatarUrl: ws.avatarUrl,
    memberCount: ws.memberCount,
    agentCount: ws.agentCount,
    credits: ws.credits,
    ai_name: (ws as any).ai_name || null,
  }
}

// ============================================================
// Page
// ============================================================

export default function TeamSettingsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('member')
  const [creating, setCreating] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [sharedAgents, setSharedAgents] = useState<Array<{ agentId: string; agentName: string; agentType: string; sharedBy: string; visibility: string; permissions: string[] }>>([])
  const [userAgents, setUserAgents] = useState<Array<{ id: string; name: string; type: string }>>([])
  const [sharingAgentId, setSharingAgentId] = useState<string | null>(null)
  const [editingWorkspace, setEditingWorkspace] = useState(false)
  const [editName, setEditName] = useState('')
  const [savingWorkspace, setSavingWorkspace] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [leavingWorkspace, setLeavingWorkspace] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingWorkspace, setDeletingWorkspace] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferringOwnership, setTransferringOwnership] = useState(false)
  const [pendingTransferMember, setPendingTransferMember] = useState<WorkspaceMember | null>(null)

  // Lovable-style UI state
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [pendingInvites, setPendingInvites] = useState<Array<{ id: string; workspaceId: string; email: string; role: string; invitedBy: string; expiresAt: string; createdAt: string }>>([])
  const [workspaceInvites, setWorkspaceInvites] = useState<Array<{ id: string; email: string; role: string; createdAt: string }>>([])

  const {
    activeWorkspace,
    setWorkspaces: setGlobalWorkspaces,
    setActiveWorkspace: setGlobalActiveWorkspace,
    setUserRole: setGlobalUserRole,
  } = useWorkspaceStore()

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/teams')
      if (res.ok) {
        const data = await res.json()
        let ws = data.workspaces || data.organizations || []

        // Auto-create personal workspace if none exist (like Lovable)
        if (ws.length === 0) {
          const createRes = await fetch('/api/teams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ensure_personal_workspace' }),
          })
          if (createRes.ok) {
            const createData = await createRes.json()
            const personal = createData.workspace || createData.organization
            if (personal) ws = [personal]
          }
        }

        setWorkspaces(ws)

        setGlobalWorkspaces((ws as Workspace[]).map(toWorkspaceInfo))

        if (ws.length > 0) {
          const preferredId = activeWorkspace?.id
          const preferred = preferredId ? (ws as Workspace[]).find(w => w.id === preferredId) : null
          const activeWorkspaceMissing = Boolean(activeWorkspace && !preferred)

          if (!selectedWorkspace) {
            setSelectedWorkspace(preferred || ws[0])
          } else if (!(ws as Workspace[]).some(w => w.id === selectedWorkspace.id)) {
            setSelectedWorkspace(preferred || ws[0])
          }

          if (!activeWorkspace || activeWorkspaceMissing) {
            setGlobalActiveWorkspace(toWorkspaceInfo((preferred || ws[0]) as Workspace))
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err)
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, selectedWorkspace, setGlobalActiveWorkspace, setGlobalWorkspaces])

  const fetchMembers = useCallback(async (wsId: string) => {
    try {
      const res = await fetch(`/api/teams?workspaceId=${wsId}&action=members`)
      if (res.ok) {
        const data = await res.json()
        setMembers(data.members || [])
      }
    } catch (err) {
      console.error('Failed to fetch members:', err)
    }
  }, [])

  const fetchWorkspaceDetails = useCallback(async (wsId: string) => {
    try {
      const res = await fetch(`/api/teams?workspaceId=${wsId}`)
      if (res.ok) {
        const data = await res.json()
        setUserRole(data.role || null)
        setGlobalUserRole(data.role || null)
      }
    } catch (err) {
      console.error('Failed to fetch workspace details:', err)
    }
  }, [setGlobalUserRole])

  useEffect(() => { fetchWorkspaces() }, [fetchWorkspaces])

  useEffect(() => {
    try {
      const intent = localStorage.getItem('2hands_create_workspace_intent')
      if (intent) {
        localStorage.removeItem('2hands_create_workspace_intent')
        setShowCreateWorkspace(true)
      }
    } catch {}
  }, [])

  const fetchSharedAgents = useCallback(async (wsId: string) => {
    try {
      const res = await fetch(`/api/teams?workspaceId=${wsId}&action=shared-agents`)
      if (res.ok) {
        const data = await res.json()
        setSharedAgents(data.agents || [])
      }
    } catch (err) {
      console.error('Failed to fetch shared agents:', err)
    }
  }, [])

  const fetchUserAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      if (res.ok) {
        const data = await res.json()
        setUserAgents((data.agents || []).map((a: Record<string, unknown>) => ({ id: a.id as string, name: a.name as string, type: a.type as string })))
      }
    } catch (err) {
      console.error('Failed to fetch user agents:', err)
    }
  }, [])

  const fetchPendingInvites = useCallback(async () => {
    try {
      const res = await fetch('/api/teams?action=pending-invites')
      if (res.ok) {
        const data = await res.json()
        setPendingInvites(data.invites || [])
      }
    } catch (err) {
      console.error('Failed to fetch pending invites:', err)
    }
  }, [])

  const fetchWorkspaceInvites = useCallback(async (wsId: string) => {
    try {
      const res = await fetch(`/api/teams?workspaceId=${wsId}&action=invites`)
      if (res.ok) {
        const data = await res.json()
        setWorkspaceInvites(data.invites || [])
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (selectedWorkspace) {
      fetchMembers(selectedWorkspace.id)
      fetchWorkspaceDetails(selectedWorkspace.id)
      fetchSharedAgents(selectedWorkspace.id)
      fetchUserAgents()
      fetchWorkspaceInvites(selectedWorkspace.id)
    }
  }, [selectedWorkspace, fetchMembers, fetchWorkspaceDetails, fetchSharedAgents, fetchUserAgents, fetchWorkspaceInvites])

  useEffect(() => { fetchPendingInvites() }, [fetchPendingInvites])

  // Sorted & filtered members
  const filteredMembers = useMemo(() => {
    let result = [...members]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(m =>
        (m.displayName?.toLowerCase().includes(q)) ||
        m.email.toLowerCase().includes(q)
      )
    }
    if (roleFilter !== 'all') {
      result = result.filter(m => m.role === roleFilter)
    }
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name': cmp = (a.displayName || a.email).localeCompare(b.displayName || b.email); break
        case 'role': cmp = a.role.localeCompare(b.role); break
        case 'joinedAt': cmp = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(); break
        case 'creditsUsedThisMonth': cmp = a.creditsUsedThisMonth - b.creditsUsedThisMonth; break
        case 'creditsUsed': cmp = a.creditsUsed - b.creditsUsed; break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [members, searchQuery, roleFilter, sortField, sortDir])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleCreateWorkspace = async () => {
    if (!workspaceName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_workspace', name: workspaceName.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success('Workspace created')
        const ws = data.workspace || data.organization
        // Use returned workspaces list or fall back to adding the new workspace
        const updatedWorkspaces = data.workspaces || [...workspaces, ws]
        setWorkspaces(updatedWorkspaces)
        setGlobalWorkspaces(updatedWorkspaces.map(toWorkspaceInfo))
        setSelectedWorkspace(ws)
        setGlobalActiveWorkspace(toWorkspaceInfo(ws))
        setGlobalUserRole('owner')
        setShowCreateWorkspace(false)
        setWorkspaceName('')
        // Fetch details for the new workspace
        fetchWorkspaceDetails(ws.id)
      } else {
        toast.error('Failed to create workspace')
      }
    } catch {
      toast.error('Failed to create workspace')
    } finally {
      setCreating(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !selectedWorkspace) return
    setInviting(true)
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'invite_member',
          workspaceId: selectedWorkspace.id,
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      })
      if (res.ok) {
        toast.success(`Invitation sent to ${inviteEmail}`)
        setShowInvite(false)
        setInviteEmail('')
        setInviteRole('member')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to send invite')
      }
    } catch {
      toast.error('Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!selectedWorkspace) return
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_member', workspaceId: selectedWorkspace.id, userId }),
      })
      if (res.ok) {
        toast.success('Member removed')
        fetchMembers(selectedWorkspace.id)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to remove member')
      }
    } catch {
      toast.error('Failed to remove member')
    }
  }

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (!selectedWorkspace) return
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_role', workspaceId: selectedWorkspace.id, userId, role: newRole }),
      })
      if (res.ok) {
        toast.success('Role updated')
        fetchMembers(selectedWorkspace.id)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to update role')
      }
    } catch {
      toast.error('Failed to update role')
    }
  }

  const handleShareAgent = async (agentId: string) => {
    if (!selectedWorkspace) return
    setSharingAgentId(agentId)
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'share_agent', workspaceId: selectedWorkspace.id, agentId }),
      })
      if (res.ok) {
        toast.success('Agent shared with workspace')
        fetchSharedAgents(selectedWorkspace.id)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to share agent')
      }
    } catch {
      toast.error('Failed to share agent')
    } finally {
      setSharingAgentId(null)
    }
  }

  const handleUpdateWorkspace = async () => {
    if (!selectedWorkspace || !editName.trim()) return
    setSavingWorkspace(true)
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_workspace',
          workspaceId: selectedWorkspace.id,
          name: editName.trim(),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success('Workspace updated')
        // Use returned workspace data or fall back to local update
        const updatedWs = data.workspace || { ...selectedWorkspace, name: editName.trim() }
        setSelectedWorkspace(updatedWs)
        setGlobalActiveWorkspace(toWorkspaceInfo(updatedWs))
        // Update workspaces list with new name
        const updatedList = workspaces.map(w => w.id === selectedWorkspace.id ? updatedWs : w)
        setWorkspaces(updatedList)
        setGlobalWorkspaces(updatedList.map(toWorkspaceInfo))
        setEditingWorkspace(false)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to update workspace')
      }
    } catch {
      toast.error('Failed to update workspace')
    } finally {
      setSavingWorkspace(false)
    }
  }

  const handleLeaveWorkspace = () => {
    if (!selectedWorkspace) return
    setLeaveDialogOpen(true)
  }

  const confirmLeaveWorkspace = async () => {
    if (!selectedWorkspace) return
    setLeavingWorkspace(true)
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'leave_workspace', workspaceId: selectedWorkspace.id }),
      })
      if (res.ok) {
        toast.success('Left workspace')
        setLeaveDialogOpen(false)
        setMembers([])
        await fetchWorkspaces()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to leave workspace')
      }
    } catch {
      toast.error('Failed to leave workspace')
    } finally {
      setLeavingWorkspace(false)
    }
  }

  const handleDeleteWorkspace = () => {
    if (!selectedWorkspace) return
    if (selectedWorkspace.isPersonal) {
      toast.error('Personal workspace cannot be deleted')
      return
    }
    setDeleteDialogOpen(true)
  }

  const confirmDeleteWorkspace = async () => {
    if (!selectedWorkspace) return
    const deleteConfirmation = `DELETE ${selectedWorkspace.name}`

    setDeletingWorkspace(true)

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_workspace',
          workspaceId: selectedWorkspace.id,
          deleteConfirmation,
        }),
      })
      if (res.ok) {
        toast.success('Workspace deleted')
        setDeleteDialogOpen(false)
        setEditingWorkspace(false)
        setMembers([])
        await fetchWorkspaces()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete workspace')
      }
    } catch {
      toast.error('Failed to delete workspace')
    } finally {
      setDeletingWorkspace(false)
    }
  }

  const handleTransferOwnership = (newOwnerId: string) => {
    if (!selectedWorkspace) return
    const member = members.find(m => m.userId === newOwnerId)
    if (!member) return
    setPendingTransferMember(member)
    setTransferDialogOpen(true)
  }

  const confirmTransferOwnership = async () => {
    if (!selectedWorkspace || !pendingTransferMember) return
    setTransferringOwnership(true)
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transfer_ownership',
          workspaceId: selectedWorkspace.id,
          newOwnerId: pendingTransferMember.userId,
        }),
      })
      if (res.ok) {
        toast.success('Ownership transferred')
        setTransferDialogOpen(false)
        setPendingTransferMember(null)
        fetchMembers(selectedWorkspace.id)
        fetchWorkspaceDetails(selectedWorkspace.id)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to transfer ownership')
      }
    } catch {
      toast.error('Failed to transfer ownership')
    } finally {
      setTransferringOwnership(false)
    }
  }

  const isAdmin = userRole === 'owner' || userRole === 'admin'
  const canEditWorkspace = isAdmin || Boolean(selectedWorkspace?.isPersonal)
  const currentMonth = new Date().toLocaleString('default', { month: 'short' })
  const deleteVerificationText = selectedWorkspace ? `DELETE ${selectedWorkspace.name}` : ''

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // No workspace — empty state
  if (workspaces.length === 0 && !showCreateWorkspace) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center py-24">
          <Users className="w-10 h-10 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-[15px] font-medium text-foreground mb-1">No workspace yet</p>
          <p className="text-[13px] text-muted-foreground mb-6">
            Create a workspace to invite team members and share agents.
          </p>
          <button
            onClick={() => setShowCreateWorkspace(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Create Workspace
          </button>
        </div>
      </div>
    )
  }

  const createWorkspacePanel = showCreateWorkspace ? (
    <div className="p-6 rounded-xl border border-border bg-sidebar">
      <h3 className="text-[15px] font-medium text-foreground mb-4">Create Workspace</h3>
      <div className="flex gap-3">
        <input
          type="text"
          value={workspaceName}
          onChange={e => setWorkspaceName(e.target.value)}
          placeholder="Workspace name"
          className="flex-1 px-4 py-2 rounded-lg border border-border bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-foreground"
          onKeyDown={e => e.key === 'Enter' && handleCreateWorkspace()}
          autoFocus
        />
        <button
          onClick={handleCreateWorkspace}
          disabled={creating || !workspaceName.trim()}
          className="px-5 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
        </button>
        <button
          onClick={() => { setShowCreateWorkspace(false); setWorkspaceName('') }}
          className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  ) : null

  if (!selectedWorkspace) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {createWorkspacePanel}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {createWorkspacePanel}

      <ConfirmationDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        title="Leave workspace"
        description="You will lose access to shared agents and member resources in this workspace."
        confirmLabel="Leave workspace"
        onConfirm={confirmLeaveWorkspace}
        isConfirming={leavingWorkspace}
      />

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete workspace"
        description="This action is permanent and cannot be undone."
        verificationText={deleteVerificationText}
        verificationPlaceholder="Type DELETE <workspace name>"
        confirmLabel="Delete workspace"
        onConfirm={confirmDeleteWorkspace}
        isConfirming={deletingWorkspace}
        destructive
      />

      <ConfirmationDialog
        open={transferDialogOpen}
        onOpenChange={(open) => {
          setTransferDialogOpen(open)
          if (!open) setPendingTransferMember(null)
        }}
        title="Transfer ownership"
        description={`Transfer ownership to ${pendingTransferMember?.displayName || pendingTransferMember?.email || 'this member'}? You will be downgraded to admin.`}
        confirmLabel="Transfer ownership"
        onConfirm={confirmTransferOwnership}
        isConfirming={transferringOwnership}
      />

      {/* Header — like Lovable "People" */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-medium text-foreground">People</h2>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Inviting people to <span className="font-semibold text-foreground">{selectedWorkspace?.name}</span> gives access to workspace shared agents and credits.
          {members.length > 0 && <> You have {members.length} {members.length === 1 ? 'member' : 'members'} in this workspace.</>}
        </p>
      </div>

      {/* Workspace selector (if multiple) */}
      {workspaces.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {workspaces.map(ws => (
            <div key={ws.id} className="flex items-center">
              {selectedWorkspace?.id === ws.id && canEditWorkspace ? (
                <div className="flex items-center pl-3 pr-0.5 py-1 rounded-lg bg-foreground text-background">
                  <span className="text-[12px] font-medium pr-2">{ws.name}</span>
                  <button
                    onClick={() => { setEditName(ws.name || ''); setEditingWorkspace(true) }}
                    className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-background/20 transition-all"
                    title="Rename workspace"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setSelectedWorkspace(ws)
                    setGlobalActiveWorkspace(toWorkspaceInfo(ws))
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    selectedWorkspace?.id === ws.id
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {ws.name}
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setShowCreateWorkspace(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border"
            title="New workspace"
          >
            <Plus className="w-3.5 h-3.5" />
            New workspace
          </button>
        </div>
      )}

      {/* Edit workspace inline */}
      {editingWorkspace && selectedWorkspace && (
        <div className="p-4 rounded-xl border border-border bg-sidebar/70 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="Workspace name"
              className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-foreground"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleUpdateWorkspace}
                disabled={savingWorkspace || !editName.trim()}
                className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {savingWorkspace ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Save</>}
              </button>
              <button
                onClick={() => setEditingWorkspace(false)}
                className="h-10 px-4 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border/50">
            {userRole !== 'owner' && (
              <button onClick={handleLeaveWorkspace} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-red-500 transition-colors">
                <LogOut className="w-3.5 h-3.5" /> Leave workspace
              </button>
            )}
            {userRole === 'owner' && !selectedWorkspace.isPersonal && (
              <button onClick={handleDeleteWorkspace} className="flex items-center gap-1.5 text-[12px] text-red-500/80 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Delete workspace
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tabs — like Lovable */}
      <div className="flex items-center gap-1 border-b border-border">
        {([['all', 'All'], ['invitations', 'Invitations'], ['agents', 'Shared Agents']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
              activeTab === id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: All (member table like Lovable) */}
      {activeTab === 'all' && selectedWorkspace && (
        <div className="space-y-4">
          {/* Toolbar: search + filter + invite */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-transparent text-[13px] text-foreground placeholder-muted-foreground focus:outline-none focus:border-foreground"
              />
            </div>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-transparent text-[13px] text-foreground"
            >
              <option value="all">All roles</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <div className="flex-1" />
            {isAdmin && (
              <button
                onClick={() => setShowInvite(!showInvite)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Invite members
              </button>
            )}
          </div>

          {/* Invite form */}
          {showInvite && isAdmin && (
            <div className="p-4 rounded-xl border border-border bg-sidebar">
              <div className="flex gap-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="Email address"
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-transparent text-[13px] text-foreground placeholder-muted-foreground focus:outline-none"
                  autoFocus
                />
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-transparent text-[13px] text-foreground"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="px-4 py-2 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send invite'}
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-sidebar/50">
                  <SortHeader field="name" label="Name" current={sortField} dir={sortDir} onSort={toggleSort} />
                  <SortHeader field="role" label="Role" current={sortField} dir={sortDir} onSort={toggleSort} />
                  <SortHeader field="joinedAt" label="Joined date" current={sortField} dir={sortDir} onSort={toggleSort} />
                  <SortHeader field="creditsUsedThisMonth" label={`${currentMonth} usage`} current={sortField} dir={sortDir} onSort={toggleSort} />
                  <SortHeader field="creditsUsed" label="Total usage" current={sortField} dir={sortDir} onSort={toggleSort} />
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map(member => (
                  <tr key={member.id} className="border-b border-border last:border-0 hover:bg-sidebar/30 transition-colors">
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground shrink-0">
                          {(member.displayName || member.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-foreground truncate">
                            {member.displayName || member.email.split('@')[0]}
                            {member.role === userRole && member.role === 'owner' && (
                              <span className="text-muted-foreground font-normal"> (you)</span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    {/* Role */}
                    <td className="px-4 py-3">
                      {isAdmin && member.role !== 'owner' ? (
                        <select
                          value={member.role}
                          onChange={e => handleChangeRole(member.userId, e.target.value)}
                          className="text-[12px] px-2 py-1 rounded-md border border-border bg-transparent text-muted-foreground capitalize cursor-pointer hover:border-foreground/30 transition-colors"
                        >
                          {userRole === 'owner' && <option value="admin">Admin</option>}
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : (
                        <span className="text-[12px] text-muted-foreground capitalize">{member.role}</span>
                      )}
                    </td>
                    {/* Joined */}
                    <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                      {new Date(member.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    {/* Monthly usage */}
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">
                      {member.creditsUsedThisMonth > 0 ? `${member.creditsUsedThisMonth} credits` : '\u2014'}
                    </td>
                    {/* Total usage */}
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">
                      {member.creditsUsed > 0 ? `${member.creditsUsed} credits` : '\u2014'}
                    </td>
                    {/* Actions */}
                    <td className="px-2 py-3">
                      {isAdmin && member.role !== 'owner' && (
                        <div className="relative">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {openMenuId === member.id && (
                            <div className="absolute right-0 top-8 z-50 w-44 rounded-xl border border-border bg-sidebar shadow-lg py-1">
                              {userRole === 'owner' && (
                                <button
                                  onClick={() => { handleTransferOwnership(member.userId); setOpenMenuId(null) }}
                                  className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-foreground hover:bg-muted transition-colors"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5" />
                                  Transfer ownership
                                </button>
                              )}
                              <button
                                onClick={() => { handleRemoveMember(member.userId); setOpenMenuId(null) }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-red-500 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Remove member
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <p className="text-[11px] text-muted-foreground">
            Showing {filteredMembers.length} of {members.length}
          </p>
        </div>
      )}

      {/* Tab: Invitations */}
      {activeTab === 'invitations' && (
        <div className="space-y-6">
          {/* Invites you've received */}
          {pendingInvites.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Invitations for you</h4>
              <div className="rounded-xl border border-border overflow-hidden">
                {pendingInvites.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 hover:bg-sidebar/30 transition-colors">
                    <div>
                      <p className="text-[13px] font-medium text-foreground">Workspace invitation</p>
                      <p className="text-[11px] text-muted-foreground">Role: <span className="capitalize">{inv.role}</span> — Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const res = await fetch('/api/teams', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'accept_invite', inviteId: inv.id }),
                          })
                          if (res.ok) {
                            toast.success('Invitation accepted!')
                            fetchPendingInvites()
                            fetchWorkspaces()
                          } else {
                            toast.error('Failed to accept invitation')
                          }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground text-background text-[12px] font-medium hover:opacity-90 transition-opacity"
                      >
                        <Check className="w-3 h-3" /> Accept
                      </button>
                      <button
                        onClick={async () => {
                          const res = await fetch('/api/teams', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'decline_invite', inviteId: inv.id }),
                          })
                          if (res.ok) {
                            toast.success('Invitation declined')
                            fetchPendingInvites()
                          }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="w-3 h-3" /> Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invites sent from this workspace */}
          {isAdmin && selectedWorkspace && (
            <div className="space-y-3">
              <h4 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Pending invitations sent</h4>
              {workspaceInvites.length === 0 ? (
                <div className="py-10 text-center">
                  <Mail className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-[13px] text-muted-foreground">No pending invitations.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-sidebar/50">
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspaceInvites.map(inv => (
                        <tr key={inv.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 text-[13px] text-foreground">{inv.email}</td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground capitalize">{inv.role}</td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {pendingInvites.length === 0 && (!isAdmin || workspaceInvites.length === 0) && (
            <div className="py-16 text-center">
              <Mail className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-[13px] text-muted-foreground">No pending invitations.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Shared Agents */}
      {activeTab === 'agents' && selectedWorkspace && (
        <div className="space-y-4">
          {sharedAgents.length === 0 ? (
            <div className="py-16 text-center">
              <Bot className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-[13px] text-muted-foreground">No agents shared with this workspace yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-sidebar/50">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Agent</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Visibility</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Permissions</th>
                  </tr>
                </thead>
                <tbody>
                  {sharedAgents.map(sa => (
                    <tr key={sa.agentId} className="border-b border-border last:border-0 hover:bg-sidebar/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-foreground/5 flex items-center justify-center text-muted-foreground">
                            {sa.agentType === 'web-research' ? <Globe className="w-3.5 h-3.5" /> :
                             sa.agentType === 'email-assistant' ? <Mail className="w-3.5 h-3.5" /> :
                             sa.agentType === 'data-analyst' ? <Database className="w-3.5 h-3.5" /> :
                             sa.agentType === 'file-organizer' ? <FileSearch className="w-3.5 h-3.5" /> :
                             <Bot className="w-3.5 h-3.5" />}
                          </div>
                          <span className="text-[13px] font-medium text-foreground">{sa.agentName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground capitalize">{sa.visibility}</td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground">{sa.permissions.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isAdmin && userAgents.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                className="flex-1 max-w-[280px] px-3 py-2 rounded-lg border border-border bg-transparent text-[12px] text-foreground"
                defaultValue=""
                onChange={e => { if (e.target.value) handleShareAgent(e.target.value); e.target.value = '' }}
                disabled={!!sharingAgentId}
              >
                <option value="" disabled>Share an agent...</option>
                {userAgents
                  .filter(a => !sharedAgents.some(sa => sa.agentId === a.id))
                  .map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
              </select>
              {sharingAgentId && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Sortable Table Header
// ============================================================

function SortHeader({
  field, label, current, dir, onSort
}: {
  field: SortField
  label: string
  current: SortField
  dir: SortDir
  onSort: (f: SortField) => void
}) {
  const isActive = current === field
  return (
    <th
      onClick={() => onSort(field)}
      className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="inline-flex flex-col -space-y-1">
          <ChevronUp className={`w-3 h-3 ${isActive && dir === 'asc' ? 'text-foreground' : 'text-muted-foreground/30'}`} />
          <ChevronDown className={`w-3 h-3 ${isActive && dir === 'desc' ? 'text-foreground' : 'text-muted-foreground/30'}`} />
        </span>
      </span>
    </th>
  )
}
