import { redirect } from 'next/navigation'
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
  
  // Middleware handles auth gating, but we need the user for data fetching
  // This is a lightweight defensive check + user fetch in one call
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // This should rarely happen (middleware redirects first), but handle gracefully
    redirect('/sign-in')
  }

  // Get active workspace from cookie (set client-side by workspace-store)
  const cookieStore = await cookies()
  const activeWorkspaceId = cookieStore.get('2hands_active_workspace_id')?.value

  // Fetch recent agents for the sidebar — failure is non-fatal; client-side
  // real-time subscriptions will populate them after mount.
  let agents: Agent[] = []
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
