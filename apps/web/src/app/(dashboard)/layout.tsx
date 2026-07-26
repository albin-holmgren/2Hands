import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layouts/dashboard-layout'
import { WorkspaceProvider } from '@/components/workspace-provider'
import type { Metadata } from 'next'
import type { Agent } from '@/types/database'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
}

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Middleware is the auth gate for this route group; this fetch is for data.
  //
  // A null user is not an error here: APP_HOME is deliberately public so the
  // app is browsable signed-out, and that route lives in this group. Every
  // other route under it is still gated by middleware, so the only way to get
  // here without a session is the one route that is meant to allow it. The
  // chrome reads user/profile optionally and the shell renders its empty
  // state, so there is nothing to guard beyond skipping the user-scoped query.
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch recent agents for the sidebar — failure is non-fatal; client-side
  // real-time subscriptions will populate them after mount.
  let agents: Agent[] = []
  if (user) {
    // Get active workspace from cookie (set client-side by workspace-store)
    const cookieStore = await cookies()
    const activeWorkspaceId = cookieStore.get('2hands_active_workspace_id')?.value

    try {
      let query = supabase
        .from('agents')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['initializing', 'idle', 'working', 'completed', 'failed'])
        .order('last_active', { ascending: false })
        .limit(50)

      if (activeWorkspaceId) {
        query = query.eq('workspace_id', activeWorkspaceId as never)
      }

      const { data } = await query
      agents = (data as Agent[]) || []
    } catch {
      // Non-fatal: sidebar will be populated via real-time subscription after mount
    }
  }

  return (
    <WorkspaceProvider>
      <DashboardLayout
        agents={agents || []}
      >
        {children}
      </DashboardLayout>
    </WorkspaceProvider>
  )
}
