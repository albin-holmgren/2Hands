import { getUserRole, getUserWorkspaces, type WorkspaceRole } from '@/lib/enterprise/teams'

interface ResolveWorkspaceScopeOptions {
  strictPreferred?: boolean
}

export async function resolveWorkspaceScope(
  userId: string,
  preferredWorkspaceId?: string | null,
  options: ResolveWorkspaceScopeOptions = {}
): Promise<{ workspaceId: string | null; role: WorkspaceRole | null }> {
  const preferred = typeof preferredWorkspaceId === 'string' ? preferredWorkspaceId.trim() : ''

  if (preferred) {
    const preferredRole = await getUserRole(preferred, userId)
    if (preferredRole) {
      return { workspaceId: preferred, role: preferredRole }
    }

    if (options.strictPreferred) {
      return { workspaceId: null, role: null }
    }
  }

  const workspaces = await getUserWorkspaces(userId)
  if (!workspaces.length) return { workspaceId: null, role: null }

  const fallbackWorkspaceId = workspaces[0].id
  const fallbackRole = await getUserRole(fallbackWorkspaceId, userId)

  return {
    workspaceId: fallbackWorkspaceId,
    role: fallbackRole,
  }
}
