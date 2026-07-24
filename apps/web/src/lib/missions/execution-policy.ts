/**
 * Mission Execution Policy
 *
 * Central runtime policy gate that maps (autonomy_level, action_class) to
 * { allowed, needs_approval, reason }. Call checkExecutionPolicy() before
 * any delegation or side-effecting action to enforce mission autonomy rules.
 *
 * Action classes (least → most risky):
 *   research           – web search, reading, analysis
 *   draft              – writing content without publishing
 *   plan               – goal trees, task breakdowns
 *   read_integration   – read-only API calls (GET endpoints)
 *   write_integration  – create/update records in CRM, tools (POST/PUT/PATCH)
 *   send_communication – emails, Slack messages, DMs
 *   public_post        – social media posts, public comments
 *   code_merge         – merging PRs, deploying code
 *   financial          – invoices, payments, refunds
 *   destructive        – deleting records, bulk updates, closing issues
 */

import type { MissionAutonomyLevel, MissionConstraints } from './mission-service'

export type ActionClass =
  | 'research'
  | 'draft'
  | 'plan'
  | 'read_integration'
  | 'write_integration'
  | 'send_communication'
  | 'public_post'
  | 'code_merge'
  | 'financial'
  | 'destructive'

export interface PolicyResult {
  allowed: boolean
  needs_approval: boolean
  reason: string
  action_class: ActionClass
  autonomy_level: MissionAutonomyLevel
}

type PolicyEntry = { allowed: boolean; needs_approval: boolean }

/**
 * Policy table: autonomy_level × action_class → allowed + needs_approval
 *
 * draft_only     – research, drafting, planning, and reading integrations only.
 *                  No writes, no comms, no code ops.
 *
 * execute_with_approval – can write integrations and communicate, but these
 *                  actions must be flagged in the mission event payload so the
 *                  user can review them. Financial and destructive ops remain blocked.
 *
 * full_auto      – everything is permitted within configured constraints.
 *                  Code merges and destructive ops require an approval flag.
 *                  Financial ops are always blocked (require explicit user action).
 */
const POLICY_TABLE: Record<MissionAutonomyLevel, Record<ActionClass, PolicyEntry>> = {
  draft_only: {
    research:           { allowed: true,  needs_approval: false },
    draft:              { allowed: true,  needs_approval: false },
    plan:               { allowed: true,  needs_approval: false },
    read_integration:   { allowed: true,  needs_approval: false },
    write_integration:  { allowed: false, needs_approval: false },
    send_communication: { allowed: false, needs_approval: false },
    public_post:        { allowed: false, needs_approval: false },
    code_merge:         { allowed: false, needs_approval: false },
    financial:          { allowed: false, needs_approval: false },
    destructive:        { allowed: false, needs_approval: false },
  },
  execute_with_approval: {
    research:           { allowed: true,  needs_approval: false },
    draft:              { allowed: true,  needs_approval: false },
    plan:               { allowed: true,  needs_approval: false },
    read_integration:   { allowed: true,  needs_approval: false },
    write_integration:  { allowed: true,  needs_approval: true  },
    send_communication: { allowed: true,  needs_approval: true  },
    public_post:        { allowed: true,  needs_approval: true  },
    code_merge:         { allowed: true,  needs_approval: true  },
    financial:          { allowed: false, needs_approval: false },
    destructive:        { allowed: false, needs_approval: false },
  },
  full_auto: {
    research:           { allowed: true,  needs_approval: false },
    draft:              { allowed: true,  needs_approval: false },
    plan:               { allowed: true,  needs_approval: false },
    read_integration:   { allowed: true,  needs_approval: false },
    write_integration:  { allowed: true,  needs_approval: false },
    send_communication: { allowed: true,  needs_approval: false },
    public_post:        { allowed: true,  needs_approval: false },
    code_merge:         { allowed: true,  needs_approval: true  },
    financial:          { allowed: false, needs_approval: false },
    destructive:        { allowed: true,  needs_approval: true  },
  },
}

const ACTION_CLASS_LABELS: Record<ActionClass, string> = {
  research:           'research / analysis',
  draft:              'drafting content',
  plan:               'planning / goal-setting',
  read_integration:   'reading from integrations',
  write_integration:  'writing to integrations',
  send_communication: 'sending emails / messages',
  public_post:        'posting publicly',
  code_merge:         'merging code / deploying',
  financial:          'financial operations',
  destructive:        'destructive operations',
}

/**
 * Central policy gate.
 * Call before delegating any agent action to ensure the mission's autonomy
 * level permits that class of work.
 */
export function checkExecutionPolicy(
  autonomy_level: MissionAutonomyLevel,
  action_class: ActionClass,
  _constraints?: MissionConstraints
): PolicyResult {
  const policy = POLICY_TABLE[autonomy_level][action_class]

  if (policy.allowed) {
    return {
      allowed: true,
      needs_approval: policy.needs_approval,
      reason: policy.needs_approval
        ? `${ACTION_CLASS_LABELS[action_class]} requires an approval flag for "${autonomy_level}" missions`
        : `${ACTION_CLASS_LABELS[action_class]} is permitted for "${autonomy_level}" missions`,
      action_class,
      autonomy_level,
    }
  }

  return {
    allowed: false,
    needs_approval: false,
    reason: `${ACTION_CLASS_LABELS[action_class]} is blocked by mission autonomy level "${autonomy_level}"`,
    action_class,
    autonomy_level,
  }
}

/**
 * Infer the action class from a natural-language task description.
 * Used to classify delegations before spawning agents so the policy can gate them.
 * Defaults to 'research' (safest class) when nothing else matches.
 */
export function inferActionClass(taskDescription: string): ActionClass {
  const lower = taskDescription.toLowerCase()

  // Financial — check first (highest risk)
  if (/pay\b|invoice|refund|billing|charge\b|subscription|stripe|payment|financial|wire.transfer/.test(lower)) {
    return 'financial'
  }

  // Destructive
  if (/\bdelete\b|remove.all|destroy|drop.table|purge|bulk.update|mass.update|close.all|archive.all|wipe/.test(lower)) {
    return 'destructive'
  }

  // Code merge / deploy
  if (/merge.pr|merge.pull.request|\bdeploy\b|push.to.main|push.to.dev|release.to.prod|ship.to.prod/.test(lower)) {
    return 'code_merge'
  }

  // Public post
  if (/post.to.linkedin|tweet|post.to.twitter|post.on.social|publish.to.blog|publish.article|publish.to.medium|public.post/.test(lower)) {
    return 'public_post'
  }

  // Send communication
  if (/send.email|send.message|send.slack|outreach|dm.contact|contact.via|reach.out|send.outreach|cold.email|follow.up.email/.test(lower)) {
    return 'send_communication'
  }

  // Write integration (create / update records)
  if (/create.deal|create.contact|create.company|update.record|add.to.attio|add.to.hubspot|create.issue|create.ticket|add.row\b|insert.record|write.to/.test(lower)) {
    return 'write_integration'
  }

  // Read integration
  if (/read.from|fetch.from|list.contacts|list.deals|get.records|retrieve.from|query.attio|query.hubspot|pull.from/.test(lower)) {
    return 'read_integration'
  }

  // Draft (content to review, not publishing)
  if (/\bdraft\b|write.a.post|compose.a|write.a.blog|write.a.script|write.copy|create.content|write.content/.test(lower)) {
    return 'draft'
  }

  // Plan / organize
  if (/\bplan\b|roadmap|prioritize|organize.tasks|structure.the|goal.tree|break.down.into/.test(lower)) {
    return 'plan'
  }

  // Default to research (safest)
  return 'research'
}

/**
 * Human-readable summary of a block for UI or mission events.
 */
export function formatPolicyBlockReason(result: PolicyResult): string {
  return `[Policy: ${result.autonomy_level}] ${result.reason}`
}
