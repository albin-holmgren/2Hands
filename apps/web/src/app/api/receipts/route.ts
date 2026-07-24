import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveV3Scope, success, failureFromError } from '@/lib/v3/route-helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)

export async function GET(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const taskId = request.nextUrl.searchParams.get('taskId')
    const admin = createAdminClient()
    let query = table(admin, 'action_receipts')
      .select('*')
      .eq('workspace_id', scope.workspaceId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (taskId) query = query.eq('task_id', taskId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return success({ receipts: data ?? [] }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
