/**
 * Board Sync — bridges mission goal_tree tasks ↔ Kanban board cards
 *
 * When a mission tick starts/completes tasks, this module creates or
 * updates the corresponding mission_cards rows so the Kanban board
 * reflects the current goal tree state.
 */

import { createAdminClient } from '@/lib/supabase/admin'

interface GoalTreeTask {
  id: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
}

interface GoalTreeProject {
  id: string
  name: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
  tasks: GoalTreeTask[]
}

interface GoalTree {
  original_goal: string
  current_project_id: string | null
  projects: GoalTreeProject[]
}

const TASK_STATUS_TO_BOARD: Record<string, string> = {
  pending: 'up_next',
  in_progress: 'in_progress',
  completed: 'done',
  failed: 'blocked',
}

/**
 * Sync a mission's goal tree to board cards.
 * Creates missing cards, updates status of existing ones.
 */
export async function syncGoalTreeToBoard(
  workspaceId: string,
  missionId: string,
  goalTree: GoalTree,
  agentId?: string
): Promise<number> {
  const supabase = createAdminClient()
  let cardsCreated = 0

  // Fetch existing cards for this mission
  const { data: existingCards } = await supabase
    .from('mission_cards')
    .select('id, title, status, description')
    .eq('workspace_id', workspaceId)
    .eq('mission_id', missionId) as { data: Array<{ id: string; title: string; status: string; description: string | null }> | null }

  const existingByTitle = new Map((existingCards ?? []).map(c => [c.title, c]))

  // Get max position for ordering
  const { data: maxPosData } = await supabase
    .from('mission_cards')
    .select('position')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: false })
    .limit(1) as { data: Array<{ position: number }> | null }

  let nextPosition = (maxPosData?.[0]?.position ?? 0) + 1000

  for (const project of goalTree.projects) {
    const isCurrent = project.id === goalTree.current_project_id

    for (const task of project.tasks) {
      // Only sync tasks from current or completed projects (skip future pending projects)
      if (!isCurrent && project.status === 'pending') continue

      const boardStatus = TASK_STATUS_TO_BOARD[task.status] ?? 'inbox'
      const cardTitle = task.description.slice(0, 200)
      const cardDesc = `${project.name}`

      const existing = existingByTitle.get(cardTitle)
      if (existing) {
        // Update status if changed
        if (existing.status !== boardStatus) {
          await supabase
            .from('mission_cards')
            .update({ status: boardStatus, updated_at: new Date().toISOString() } as never)
            .eq('id', existing.id)
        }
      } else {
        // Create new card
        await supabase
          .from('mission_cards')
          .insert({
            workspace_id: workspaceId,
            title: cardTitle,
            description: cardDesc,
            status: boardStatus,
            position: nextPosition,
            mission_id: missionId,
            agent_id: agentId ?? null,
          } as never)
        nextPosition += 1000
        cardsCreated++
      }
    }
  }

  if (cardsCreated > 0) {
    console.log(`[BoardSync] Created ${cardsCreated} board cards for mission ${missionId.slice(0, 8)}`)
  }

  return cardsCreated
}

/**
 * Update a specific board card's status by matching mission_id + title.
 */
export async function updateBoardCardStatus(
  workspaceId: string,
  missionId: string,
  taskDescription: string,
  newStatus: string
): Promise<void> {
  const supabase = createAdminClient()
  const boardStatus = TASK_STATUS_TO_BOARD[newStatus] ?? newStatus

  await supabase
    .from('mission_cards')
    .update({ status: boardStatus, updated_at: new Date().toISOString() } as never)
    .eq('workspace_id', workspaceId)
    .eq('mission_id', missionId)
    .ilike('title', taskDescription.slice(0, 200))
}

/**
 * Mark a goal tree task as complete given a mission ID and task title.
 * Called when a board card is moved to "done".
 * Returns true if the task was found and updated.
 */
export async function markGoalTreeTaskFromBoard(
  missionId: string,
  cardTitle: string
): Promise<boolean> {
  const supabase = createAdminClient()

  const { data: missionData } = await supabase
    .from('missions')
    .select('goal_tree, workspace_id, user_id')
    .eq('id', missionId)
    .single() as { data: { goal_tree: GoalTree | null; workspace_id: string; user_id: string } | null }

  if (!missionData?.goal_tree) return false

  const tree = missionData.goal_tree
  let found = false

  for (const project of tree.projects) {
    for (const task of project.tasks) {
      if (task.description.slice(0, 200) === cardTitle && task.status !== 'completed') {
        task.status = 'completed'
        found = true
        break
      }
    }
    if (found) break
  }

  if (!found) return false

  // Check if current project is now fully complete
  const currentProject = tree.projects.find(p => p.id === tree.current_project_id)
  if (currentProject && currentProject.tasks.every(t => t.status === 'completed') && currentProject.tasks.length > 0) {
    currentProject.status = 'completed'
  }

  // Save updated goal tree
  await supabase
    .from('missions')
    .update({ goal_tree: tree as never, updated_at: new Date().toISOString() } as never)
    .eq('id', missionId)

  // Append event
  await supabase
    .from('mission_events')
    .insert({
      mission_id: missionId,
      workspace_id: missionData.workspace_id,
      user_id: missionData.user_id,
      kind: 'task_completed',
      summary: `Task completed via board: "${cardTitle.slice(0, 80)}"`,
      payload: { task_title: cardTitle, source: 'kanban_board' },
    } as never)

  console.log(`[BoardSync] Marked goal tree task complete via board: "${cardTitle.slice(0, 50)}"`)
  return true
}
