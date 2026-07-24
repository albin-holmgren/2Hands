import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const filesTable = (sb: Awaited<ReturnType<typeof createClient>>) => (sb as any).from('workspace_files')

interface WorkspaceFileRow {
  id: string
  workspace_id: string
  name: string
  mime_type: string
  size_bytes: number
  storage_bucket: string
  storage_path: string
  created_by: string
  created_at: string
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { workspaceId } = await resolveWorkspaceScope(user.id)
    if (!workspaceId) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

    const search = request.nextUrl.searchParams.get('search') ?? ''

    let query = filesTable(supabase)
      .select('id, name, mime_type, size_bytes, storage_bucket, storage_path, created_by, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    const { data, error } = await query as { data: WorkspaceFileRow[] | null; error: unknown }
    if (error) return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 })

    const admin = createAdminClient()
    const BUCKET = 'workspace-files'
    const SIGNED_EXPIRY = 3600

    const files = await Promise.all(
      (data ?? []).map(async (f) => {
        let download_url: string | undefined
        try {
          const { data: signed } = await admin.storage
            .from(BUCKET)
            .createSignedUrl(f.storage_path, SIGNED_EXPIRY)
          download_url = signed?.signedUrl ?? undefined
        } catch { /* skip */ }
        return { ...f, download_url }
      })
    )

    return NextResponse.json({ files, total: files.length })
  } catch (err) {
    console.error('[/api/files GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { workspaceId } = await resolveWorkspaceScope(user.id)
    if (!workspaceId) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

    const body = await request.json() as {
      name: string; mime_type: string; size_bytes: number; storage_path: string
    }
    const { name, mime_type, size_bytes, storage_path } = body

    if (!name || !storage_path) {
      return NextResponse.json({ error: 'name and storage_path are required' }, { status: 400 })
    }

    const { data, error } = await filesTable(supabase)
      .insert({
        workspace_id: workspaceId,
        name,
        mime_type: mime_type || 'application/octet-stream',
        size_bytes: size_bytes ?? 0,
        storage_bucket: 'workspace-files',
        storage_path,
        created_by: user.id,
        created_at: new Date().toISOString(),
      })
      .select()
      .single() as { data: WorkspaceFileRow | null; error: unknown }

    if (error) {
      console.error('[/api/files POST] insert error', error)
      return NextResponse.json({ error: 'Failed to register file' }, { status: 500 })
    }

    return NextResponse.json({ file: data })
  } catch (err) {
    console.error('[/api/files POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
