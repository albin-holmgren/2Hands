import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const filesTable = (sb: Awaited<ReturnType<typeof createClient>>) => (sb as any).from('workspace_files')

interface WorkspaceFileRow {
  id: string
  workspace_id: string
  storage_bucket: string
  storage_path: string
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { workspaceId } = await resolveWorkspaceScope(user.id)
    if (!workspaceId) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

    const { data: file, error: fetchError } = await filesTable(supabase)
      .select('id, workspace_id, storage_bucket, storage_path')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single() as { data: WorkspaceFileRow | null; error: unknown }

    if (fetchError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const admin = createAdminClient()
    await admin.storage.from(file.storage_bucket).remove([file.storage_path])

    const { error: deleteError } = await filesTable(supabase)
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete file record' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[/api/files/[id] DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
