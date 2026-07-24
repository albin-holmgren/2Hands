/**
 * API Key Management Endpoint
 *
 * GET  /api/v1/keys  — List all API keys for the authenticated user
 * POST /api/v1/keys  — Create a new API key
 * DELETE /api/v1/keys?id=X — Revoke an API key
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  PERMISSION_PRESETS,
  type ApiPermission,
} from '@/lib/api-platform/api-keys'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    const keys = await listApiKeys(user.id, scope.workspaceId)
    return NextResponse.json({ keys })
  } catch (err) {
    console.error('[API Keys] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const { name, preset, permissions, rateLimit, expiresInDays, workspaceId: bodyWorkspaceId } = body as {
      name?: string
      preset?: 'readonly' | 'standard' | 'admin'
      permissions?: ApiPermission[]
      rateLimit?: number
      expiresInDays?: number
      workspaceId?: string
    }

    const requestedWorkspaceId = (typeof bodyWorkspaceId === 'string' && bodyWorkspaceId.trim())
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    // Check key count limit (max 10 per workspace)
    const existing = await listApiKeys(user.id, scope.workspaceId)
    if (existing.filter(k => k.isActive).length >= 10) {
      return NextResponse.json({ error: 'Maximum 10 active API keys per workspace' }, { status: 400 })
    }

    const perms = permissions || (preset ? PERMISSION_PRESETS[preset] : PERMISSION_PRESETS.standard)

    const { key, rawKey } = await createApiKey(user.id, scope.workspaceId, name, perms, {
      rateLimit,
      expiresInDays,
    })

    return NextResponse.json({
      key: {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        permissions: key.permissions,
        rateLimit: key.rateLimit,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
      },
      // IMPORTANT: This is the only time the raw key is returned
      rawKey,
      warning: 'Save this key now. It will not be shown again.',
    }, { status: 201 })
  } catch (err) {
    console.error('[API Keys] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const keyId = searchParams.get('id')
    if (!keyId) {
      return NextResponse.json({ error: 'Key ID required' }, { status: 400 })
    }

    const requestedWorkspaceId = searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    const success = await revokeApiKey(user.id, scope.workspaceId, keyId)
    if (!success) {
      return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API Keys] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
