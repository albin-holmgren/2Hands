import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'

const BUCKET = 'workspace-files'
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { workspaceId } = await resolveWorkspaceScope(user.id)
    if (!workspaceId) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

    const body = await request.json() as { name: string; mime_type: string; size_bytes: number }
    const { name, mime_type, size_bytes } = body

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    if (size_bytes > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 413 })
    }

    const ext = name.includes('.') ? name.split('.').pop() : ''
    const safeFilename = name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storage_path = `${workspaceId}/${crypto.randomUUID()}-${safeFilename}`

    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storage_path)

    if (error || !data?.signedUrl) {
      console.error('[/api/files/upload-url]', error)
      return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 })
    }

    return NextResponse.json({
      upload_url: data.signedUrl,
      storage_path,
      bucket: BUCKET,
      mime_type: mime_type || 'application/octet-stream',
      ext,
    })
  } catch (err) {
    console.error('[/api/files/upload-url POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
