/**
 * v3 memory service — MemoryItem lifecycle (proposed → active | rejected →
 * expired) over public.memory_items, with a storage-time secret filter and
 * poisoning defenses.
 *
 * Invariants:
 *  - credential-like content NEVER becomes a memory row: the filter runs
 *    before any insert and throws MemoryRejectedError with a safe reason
 *    (the offending content itself is never echoed back or logged);
 *  - zero-width/bidi Unicode is stripped before scanning so hidden text
 *    cannot smuggle instructions past the filter;
 *  - instruction-injection phrasing is rejected outright (memory content is
 *    facts about the user/project, not directives to the model);
 *  - delete is a hard DELETE (embedding nulled first, then row removed) so
 *    retrieval can never see a deleted memory;
 *  - retrieval is hybrid FTS + confidence + recency + usefulness + pinned
 *    boost via the v3_retrieve_memories RPC. HONEST LIMITATION: when
 *    EMBEDDINGS_PROVIDER is unset (the default in this build) no embedding
 *    call is ever made — the embedding column stays NULL and the 0.40
 *    semantic component of the documented scoring contributes exactly 0.
 */
import { createAdminClient } from '@/lib/supabase/admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)
const rpc = (sb: ReturnType<typeof createAdminClient>, name: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb as any).rpc(name, args)

export type MemoryScope = 'user' | 'workspace' | 'project'
export type MemoryType = 'profile' | 'project' | 'episodic' | 'skill' | 'fact'
export type MemoryStatus = 'proposed' | 'active' | 'rejected' | 'expired'

export interface MemoryItemRow {
  id: string
  workspace_id: string
  user_id: string | null
  scope: MemoryScope
  type: MemoryType
  content: string
  source_task_id: string | null
  source_kind: string | null
  confidence: number
  sensitivity: 'normal' | 'sensitive' | 'secret'
  status: MemoryStatus
  pinned: boolean
  usefulness: number
  last_used_at: string | null
  expires_at: string | null
  review_at: string | null
  created_at: string
  updated_at: string
}

export interface RetrievedMemory {
  id: string
  content: string
  type: MemoryType
  scope: MemoryScope
  sensitivity: string
  confidence: number
  usefulness: number
  pinned: boolean
  source_task_id: string | null
  last_used_at: string | null
  created_at: string
  score: number
}

// ============================================================================
// Secret filter + poisoning defenses (pure functions, unit-tested directly)
// ============================================================================

/** Thrown when content must not be stored. `reason` is safe to surface/log. */
export class MemoryRejectedError extends Error {
  readonly code = 'memory_rejected'
  constructor(public readonly reason: string) {
    super(`Memory content rejected: ${reason}`)
    this.name = 'MemoryRejectedError'
  }
}

/**
 * Zero-width and bidi-control characters used to hide text from humans while
 * remaining visible to models (memory-poisoning vector).
 */
const INVISIBLE_UNICODE =
  // zero-width space/joiners, bidi marks + embeddings/overrides, word-joiner
  // block, Arabic letter mark, soft hyphen, BOM.
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u061C\u00AD\uFEFF]/g

/** Strip invisible/bidi characters so the scanners see what a model would. */
export function stripInvisibleUnicode(content: string): string {
  return content.replace(INVISIBLE_UNICODE, '')
}

/** Credential-like patterns. Reasons are safe: they never include the match. */
const SECRET_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  { reason: 'api_key_pattern', pattern: /\bsk-[A-Za-z0-9_-]{8,}/ },
  { reason: 'api_key_pattern', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}/ },
  { reason: 'api_key_pattern', pattern: /\bgithub_pat_[A-Za-z0-9_]{16,}/ },
  { reason: 'api_key_pattern', pattern: /\bAKIA[0-9A-Z]{12,}/ },
  { reason: 'api_key_pattern', pattern: /\bxox[baprs]-[A-Za-z0-9-]{8,}/ },
  { reason: 'jwt_like_token', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { reason: 'password_assignment', pattern: /\b(?:password|passwd|pwd|passphrase)\s*[:=]\s*\S+/i },
  { reason: 'authorization_header', pattern: /\bauthorization\s*:\s*bearer\b/i },
  { reason: 'bearer_token', pattern: /\bbearer\s+[A-Za-z0-9._~+/-]{16,}=*/i },
  { reason: 'cookie_string', pattern: /\b(?:set-cookie|cookie)\s*:/i },
  {
    reason: 'cookie_string',
    pattern: /\b[A-Za-z0-9_-]+=[A-Za-z0-9%+/=_-]{12,};\s*(?:path|domain|expires|max-age|httponly|secure|samesite)\b/i,
  },
  { reason: 'session_token', pattern: /\bsession(?:_?id|_?token)?=[A-Za-z0-9%_-]{12,}/i },
  { reason: 'pem_block', pattern: /-----BEGIN [A-Z ]+-----/ },
  { reason: 'long_hex_blob', pattern: /\b[a-fA-F0-9]{32,}\b/ },
  // OTP: standalone 6 digits only counts near OTP context words.
  {
    reason: 'otp_like_code',
    pattern:
      /(?:\b(?:otp|code|verification|verify|passcode|2fa|mfa|one[- ]time)\b[^\n]{0,40}?\b\d{6}\b)|(?:\b\d{6}\b[^\n]{0,40}?\b(?:otp|code|verification|passcode|2fa|mfa)\b)/i,
  },
]

/**
 * Long base64-like blob: a 32+ char run of base64 alphabet that actually
 * looks machine-generated (contains a digit and both cases, or +/= chars) —
 * this keeps ordinary long words and URLs out of the net.
 */
function findBase64Blob(content: string): boolean {
  const runs = content.match(/[A-Za-z0-9+/=]{32,}/g) ?? []
  return runs.some((run) => {
    if (/[+/=]/.test(run)) return true
    return /\d/.test(run) && /[a-z]/.test(run) && /[A-Z]/.test(run)
  })
}

/** Instruction-injection phrasing — memories are facts, not directives. */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|prompts|rules|directions)/i,
  /disregard\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier|your)\s+(?:instructions|prompts|rules|training)/i,
  /\bsystem\s+prompt\b/i,
  /\byou\s+are\s+now\s+(?:a|an|the|in)\b/i,
  /\bnew\s+instructions?\s*:/i,
  /\bdo\s+not\s+(?:tell|inform|alert|notify)\s+the\s+user\b/i,
  /\boverride\s+(?:safety|security|policy|permissions?|approvals?)\b/i,
  /\b(?:jailbreak|dan\s+mode|developer\s+mode\s+enabled)\b/i,
  /<\s*\/?\s*(?:system|assistant|antml)[^>]*>/i,
  /\bact\s+as\s+(?:a\s+|an\s+|the\s+)?(?:system|admin|root|administrator)\b/i,
]

/**
 * Gate content before storage. Returns the sanitized (invisible-Unicode
 * stripped) content, or throws MemoryRejectedError with a safe reason.
 */
export function rejectSecretLikeContent(content: string): string {
  const sanitized = stripInvisibleUnicode(content).trim()
  if (!sanitized) throw new MemoryRejectedError('empty_content')

  for (const { reason, pattern } of SECRET_PATTERNS) {
    if (pattern.test(sanitized)) throw new MemoryRejectedError(`credential_like:${reason}`)
  }
  if (findBase64Blob(sanitized)) throw new MemoryRejectedError('credential_like:long_base64_blob')

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) throw new MemoryRejectedError('instruction_injection_pattern')
  }
  return sanitized
}

// ============================================================================
// Lifecycle
// ============================================================================

export interface ProposeMemoryInput {
  workspaceId: string
  userId?: string
  content: string
  type: MemoryType
  scope?: MemoryScope
  sourceTaskId?: string
  sourceKind?: string
  confidence?: number
  sensitivity?: 'normal' | 'sensitive'
}

/** Create a proposed memory item. The secret filter runs FIRST — always. */
export async function proposeMemory(input: ProposeMemoryInput): Promise<MemoryItemRow> {
  const content = rejectSecretLikeContent(input.content)
  if (content.length > 2000) throw new MemoryRejectedError('content_too_long')

  const admin = createAdminClient()
  const { data, error } = await table(admin, 'memory_items')
    .insert({
      workspace_id: input.workspaceId,
      user_id: input.userId ?? null,
      scope: input.scope ?? 'workspace',
      type: input.type,
      content,
      source_task_id: input.sourceTaskId ?? null,
      source_kind: input.sourceKind ?? null,
      confidence: input.confidence ?? 0.7,
      sensitivity: input.sensitivity ?? 'normal',
      status: 'proposed',
    })
    .select('*')
    .single()
  if (error) throw new Error(`proposeMemory failed: ${error.message}`)
  return data as MemoryItemRow
}

export async function getMemoryItem(id: string, workspaceId: string): Promise<MemoryItemRow | null> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'memory_items')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new Error(`getMemoryItem failed: ${error.message}`)
  return (data as MemoryItemRow) ?? null
}

async function transitionMemory(
  id: string,
  workspaceId: string,
  from: MemoryStatus[],
  to: MemoryStatus,
): Promise<MemoryItemRow> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'memory_items')
    .update({ status: to })
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .in('status', from)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`memory transition failed: ${error.message}`)
  if (!data) {
    const existing = await getMemoryItem(id, workspaceId)
    if (!existing) throw new Error('Memory item not found')
    throw new Error(`Memory item already ${existing.status}`)
  }
  return data as MemoryItemRow
}

/** proposed → active. */
export async function approveMemory(id: string, workspaceId: string): Promise<MemoryItemRow> {
  return transitionMemory(id, workspaceId, ['proposed'], 'active')
}

/** proposed → rejected. */
export async function rejectMemory(id: string, workspaceId: string): Promise<MemoryItemRow> {
  return transitionMemory(id, workspaceId, ['proposed'], 'rejected')
}

/** Pin/unpin. Pinning a proposed item activates it (pin implies approval). */
export async function pinMemory(id: string, workspaceId: string, pinned = true): Promise<MemoryItemRow> {
  const admin = createAdminClient()
  const patch: Record<string, unknown> = { pinned }
  if (pinned) patch.status = 'active'
  const { data, error } = await table(admin, 'memory_items')
    .update(patch)
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .in('status', ['proposed', 'active'])
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`pinMemory failed: ${error.message}`)
  if (!data) {
    const existing = await getMemoryItem(id, workspaceId)
    if (!existing) throw new Error('Memory item not found')
    throw new Error(`Memory item already ${existing.status}`)
  }
  return data as MemoryItemRow
}

/**
 * Hard delete: null the embedding first (belt-and-suspenders), then DELETE
 * the row. A deleted memory cannot be retrieved by any path.
 */
export async function deleteMemory(id: string, workspaceId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: existing, error: nullErr } = await table(admin, 'memory_items')
    .update({ embedding: null })
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('id')
    .maybeSingle()
  if (nullErr) throw new Error(`deleteMemory failed: ${nullErr.message}`)
  if (!existing) throw new Error('Memory item not found')

  const { error } = await table(admin, 'memory_items')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)
  if (error) throw new Error(`deleteMemory failed: ${error.message}`)
}

// ============================================================================
// Retrieval + inbox
// ============================================================================

export interface RetrieveMemoriesInput {
  workspaceId: string
  query: string
  limit?: number
}

/**
 * Hybrid retrieval. NO embedding call is made when EMBEDDINGS_PROVIDER is
 * unset (this build's default): the RPC receives a NULL query embedding and
 * the semantic term scores 0 — ranking is FTS + confidence + recency +
 * usefulness + pinned boost only. Secret-sensitivity rows are hard-filtered
 * inside the RPC and can never appear here.
 */
export async function retrieveMemories(input: RetrieveMemoriesInput): Promise<RetrievedMemory[]> {
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'v3_retrieve_memories', {
    p_workspace_id: input.workspaceId,
    p_query: input.query,
    p_limit: input.limit ?? 8,
    p_query_embedding: null, // set only when an embeddings provider is configured
  })
  if (error) throw new Error(`retrieveMemories failed: ${error.message}`)
  const rows = (data ?? []) as RetrievedMemory[]

  if (rows.length > 0) {
    // Best-effort usage marking; never fails retrieval.
    await table(admin, 'memory_items')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', rows.map((r) => r.id))
      .then(() => undefined, () => undefined)
  }
  return rows
}

/** Proposed items awaiting user review, newest first. */
export async function getMemoryInbox(workspaceId: string): Promise<MemoryItemRow[]> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'memory_items')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'proposed')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(`getMemoryInbox failed: ${error.message}`)
  return (data ?? []) as MemoryItemRow[]
}

/** List memories with optional status filter (for the memory sheet UI). */
export async function listMemories(workspaceId: string, status?: MemoryStatus): Promise<MemoryItemRow[]> {
  const admin = createAdminClient()
  let query = table(admin, 'memory_items')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(`listMemories failed: ${error.message}`)
  return (data ?? []) as MemoryItemRow[]
}
