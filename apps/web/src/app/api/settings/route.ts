import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseAndValidate, settingsUpdateRequestSchema, validationErrorResponse } from '@/lib/validation/schemas'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'

/* eslint-disable @typescript-eslint/no-explicit-any */
// Supabase tables (user_settings, notification_preferences) not in generated types

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data, error: authError } = await supabase.auth.getUser()
    const user = data?.user
    
    // ALWAYS require authentication - no exceptions
    if (authError || !user || !user.id) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null
    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId)
    if (!scope.workspaceId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
    }

    // Fetch user settings scoped to this workspace
    const { data: settings, error: settingsError } = await (supabase
      .from('user_settings' as any)
      .select('*')
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .single() as any)

    // Fetch notification preferences scoped to this workspace
    const { data: notifications } = await (supabase
      .from('notification_preferences' as any)
      .select('*')
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .single() as any)

    // If settings don't exist for this workspace, create them
    if (settingsError?.code === 'PGRST116') {
      const { data: newSettings } = await (supabase
        .from('user_settings' as any)
        .insert({ user_id: user.id, workspace_id: scope.workspaceId } as any)
        .select()
        .single() as any)
      
      const { data: newNotif } = await (supabase
        .from('notification_preferences' as any)
        .insert({ user_id: user.id, workspace_id: scope.workspaceId } as any)
        .select()
        .single() as any)

      return NextResponse.json({
        settings: newSettings,
        notifications: newNotif
      })
    }

    return NextResponse.json({
      settings: settings || null,
      notifications: notifications || null
    })
  } catch (error) {
    console.error('Settings GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data, error: authError } = await supabase.auth.getUser()
    const user = data?.user
    
    // ALWAYS require authentication - no exceptions
    if (authError || !user || !user.id) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const requestedWorkspaceId = req.nextUrl.searchParams.get('workspaceId')
      || req.cookies.get('2hands_active_workspace_id')?.value
      || null
    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId)
    if (!scope.workspaceId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
    }

    const parsed = await parseAndValidate(req, settingsUpdateRequestSchema)
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: parsed.status })
    }
    
    const { settings, notifications, profile } = parsed.data

    const results: Record<string, unknown> = {}

    // Update user settings if provided (workspace-scoped)
    if (settings) {
      const { data, error } = await (supabase
        .from('user_settings' as any)
        .upsert({
          user_id: user.id,
          workspace_id: scope.workspaceId,
          ...settings,
          updated_at: new Date().toISOString()
        } as any, { onConflict: 'user_id,workspace_id' })
        .select()
        .single() as any)

      if (error) {
        console.error('Settings update error:', error)
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
      }
      results.settings = data
    }

    // Update notification preferences if provided (workspace-scoped)
    if (notifications) {
      const { data, error } = await (supabase
        .from('notification_preferences' as any)
        .upsert({
          user_id: user.id,
          workspace_id: scope.workspaceId,
          ...notifications,
          updated_at: new Date().toISOString()
        } as any, { onConflict: 'user_id,workspace_id' })
        .select()
        .single() as any)

      if (error) {
        console.error('Notifications update error:', error)
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
      }
      results.notifications = data
    }

    // Update profile if provided
    if (profile) {
      const allowedFields = ['full_name', 'avatar_url', 'ai_name']
      const filteredProfile: Record<string, unknown> = {}
      
      for (const field of allowedFields) {
        if (field in profile) {
          filteredProfile[field] = (profile as Record<string, unknown>)[field]
        }
      }

      if (Object.keys(filteredProfile).length > 0) {
        const updateData = {
          ...filteredProfile,
          updated_at: new Date().toISOString()
        }
        const profileUpdate = (supabase as unknown as { from: (t: string) => { update: (d: unknown) => { eq: (k: string, v: string) => { select: () => { single: () => Promise<{ data: unknown; error: unknown }> } } } } })
          .from('profiles')
          .update(updateData)
          .eq('id', user.id)
          .select()
          .single()
        const { data, error } = await profileUpdate

        if (error) {
          console.error('Profile update error:', error)
          return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
        }
        results.profile = data
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Settings PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
