'use client'

import { create } from 'zustand'

export interface WorkspaceInfo {
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
  ai_name?: string | null
}

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

interface WorkspaceState {
  workspaces: WorkspaceInfo[]
  activeWorkspace: WorkspaceInfo | null
  userRole: WorkspaceRole | null
  pendingInviteCount: number
  initialized: boolean

  setWorkspaces: (workspaces: WorkspaceInfo[]) => void
  setActiveWorkspace: (ws: WorkspaceInfo) => void
  setWorkspaceAiName: (name: string) => void
  setUserRole: (role: WorkspaceRole | null) => void
  setPendingInviteCount: (count: number) => void
  setInitialized: (v: boolean) => void
  reset: () => void
}

const STORAGE_KEY = '2hands_active_workspace_id'
const COOKIE_KEY = '2hands_active_workspace_id'

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  activeWorkspace: null,
  userRole: null,
  pendingInviteCount: 0,
  initialized: false,

  setWorkspaces: (workspaces) => set({ workspaces }),

  setWorkspaceAiName: (name) =>
    set((state) => ({
      activeWorkspace: state.activeWorkspace ? { ...state.activeWorkspace, ai_name: name } : null,
      workspaces: state.workspaces.map((w) =>
        w.id === state.activeWorkspace?.id ? { ...w, ai_name: name } : w
      ),
    })),

  setActiveWorkspace: (ws) => {
    try {
      localStorage.setItem(STORAGE_KEY, ws.id)
      document.cookie = `${COOKIE_KEY}=${encodeURIComponent(ws.id)}; path=/; max-age=31536000; samesite=lax`
    } catch {}
    set({ activeWorkspace: ws })
  },

  setUserRole: (role) => set({ userRole: role }),
  setPendingInviteCount: (count) => set({ pendingInviteCount: count }),
  setInitialized: (v) => set({ initialized: v }),

  reset: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; samesite=lax`
    } catch {}
    set({ workspaces: [], activeWorkspace: null, userRole: null, pendingInviteCount: 0, initialized: false })
  },
}))

/** Get the persisted workspace ID from localStorage */
export function getPersistedWorkspaceId(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}
