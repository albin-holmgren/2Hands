import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getTemplates,
  getPopularTemplates,
  getTemplateById,
  searchTemplates,
  buildTaskFromTemplate,
  type TemplateCategory,
  TEMPLATE_CATEGORIES,
} from '@/lib/templates/agent-templates'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') as TemplateCategory | null
    const query = searchParams.get('q')
    const popular = searchParams.get('popular') === 'true'
    const id = searchParams.get('id')

    // Single template by ID
    if (id) {
      const template = getTemplateById(id)
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }
      return NextResponse.json({ template })
    }

    // Popular templates
    if (popular) {
      return NextResponse.json({
        templates: getPopularTemplates(8),
        categories: TEMPLATE_CATEGORIES,
      })
    }

    // Search
    if (query) {
      return NextResponse.json({
        templates: searchTemplates(query),
        categories: TEMPLATE_CATEGORIES,
      })
    }

    // By category or all
    return NextResponse.json({
      templates: getTemplates(category || undefined),
      categories: TEMPLATE_CATEGORIES,
    })
  } catch (error) {
    console.error('Templates API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST — Deploy a template as a new agent.
 * Body: { templateId, answers: Record<string, string>, overrides?: { name, schedule_type, schedule_cron } }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { templateId, answers, overrides } = body as {
      templateId: string
      answers: Record<string, string>
      overrides?: { name?: string; schedule_type?: string; schedule_cron?: string }
    }

    const template = getTemplateById(templateId)
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Build the task description from template + answers
    const taskDescription = buildTaskFromTemplate(template, answers || {})

    // Create the agent
    const agentName = overrides?.name || template.name
    const scheduleType = overrides?.schedule_type || template.defaultSchedule.type
    const scheduleCron = overrides?.schedule_cron || template.defaultSchedule.cron

    // Create conversation for agent
    const { data: conversation } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        title: `Agent: ${agentName}`,
        status: 'active',
      } as never)
      .select()
      .single()

    const conversationId = (conversation as { id: string } | null)?.id

    // Calculate next run time
    let nextRunAt: string | null = null
    if (scheduleType === 'scheduled' && scheduleCron) {
      const { calculateNextRunTime } = await import('@/lib/scheduler/agent-scheduler')
      const nextDate = calculateNextRunTime(scheduleCron, 'UTC')
      nextRunAt = nextDate instanceof Date ? nextDate.toISOString() : String(nextDate)
    } else if (scheduleType === 'once' || scheduleType === 'realtime') {
      nextRunAt = new Date(Date.now() + 10000).toISOString() // 10s from now
    }

    const { data: agent, error: createError } = await supabase
      .from('agents')
      .insert({
        user_id: user.id,
        name: agentName,
        type: template.agentType,
        status: 'idle',
        schedule_type: scheduleType,
        schedule_cron: scheduleCron || null,
        schedule_timezone: 'UTC',
        next_run_at: nextRunAt,
        conversation_id: conversationId,
        config: {
          description: taskDescription,
          template_id: template.id,
          template_name: template.displayName,
          requires_credentials: template.requiresCredentials,
          credential_services: template.credentialServices,
        },
      } as never)
      .select()
      .single()

    if (createError) {
      console.error('Failed to create agent from template:', createError)
      return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      agent,
      template: {
        id: template.id,
        displayName: template.displayName,
      },
    })
  } catch (error) {
    console.error('Template deploy error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
