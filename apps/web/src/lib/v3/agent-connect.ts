/**
 * Connecting the user's own coding agent (Claude Code) to 2Hands.
 *
 * The architecture rule this enforces: 2Hands never executes on its own
 * credentials. It navigates and delegates; the work runs on agents the user
 * connects, billed to accounts the user owns (BILLING.md's third ledger —
 * "external subscriptions owned by the user"). The gateway key powers the
 * 2Hands conversation brain and nothing else.
 *
 * The credential path reuses the Slice 3 machinery end to end: an auth_run,
 * a secure-input challenge whose values are sealed in the client and never
 * touch the model or logs, envelope storage in private.protected_secrets,
 * and a provider_accounts row whose token_ref is an opaque pointer — exactly
 * the shape the account-broker schema was designed for
 * (mode='user_api_key', billing_owner='user').
 */
import { createAdminClient } from '@/lib/supabase/admin'
import {
  decryptSecretValue,
  envKeyProvider,
  type SecretContext,
  type StoredCiphertext,
} from '@2hands/secret-broker'
import { createAuthRun } from '@/lib/v3/auth-runs'
import {
  createSecureInputChallenge,
  type SecureInputChallenge,
} from '@/lib/v3/secure-input'

export const AGENT_PROVIDER_ID = 'claude-code'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)
const rpc = (sb: ReturnType<typeof createAdminClient>, name: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb as any).rpc(name, args)

async function personalWorkspaceId(userId: string): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'ensure_personal_workspace', { p_user_id: userId })
  if (error || !data) {
    throw new Error(`Could not resolve workspace: ${error?.message ?? 'no id returned'}`)
  }
  return String(data)
}

/**
 * Begin connecting a Claude account: an auth run plus a sealed-input
 * challenge for one field. The client seals the key against the challenge's
 * public key and posts it to the secure-input endpoints — the plaintext never
 * transits the ordinary conversation path.
 */
export async function startAgentConnect(userId: string): Promise<{
  authRunId: string
  workspaceId: string
  challenge: SecureInputChallenge
}> {
  const workspaceId = await personalWorkspaceId(userId)
  const run = await createAuthRun({
    workspaceId,
    userId,
    providerId: AGENT_PROVIDER_ID,
    capability: 'agent_execution',
  })
  const challenge = await createSecureInputChallenge({
    authRunId: run.id,
    workspaceId,
    userId,
    fields: [
      {
        id: 'api_key',
        kind: 'api_key',
        label: 'Anthropic API key or Claude Code token',
      },
    ],
  })
  return { authRunId: run.id, workspaceId, challenge }
}

/**
 * After the sealed submit stored the secret, bind it to a connected account.
 * token_ref stays opaque — resolving it to plaintext happens only inside
 * resolveAgentCredential, at the moment of injection into the machine.
 */
export async function completeAgentConnect(input: {
  userId: string
  secretRef: string
  label?: string
}): Promise<{ accountId: string }> {
  const workspaceId = await personalWorkspaceId(input.userId)
  const admin = createAdminClient()

  // One live account per provider: reconnecting replaces rather than
  // accumulating stale rows the resolver would then have to arbitrate.
  await table(admin, 'provider_accounts')
    .update({ status: 'revoked' })
    .eq('user_id', input.userId)
    .eq('provider_id', AGENT_PROVIDER_ID)
    .eq('status', 'connected')

  const { data, error } = await table(admin, 'provider_accounts')
    .insert({
      workspace_id: workspaceId,
      user_id: input.userId,
      provider_id: AGENT_PROVIDER_ID,
      external_account_label: input.label ?? 'Claude',
      account_owner: 'user',
      billing_owner: 'user',
      mode: 'user_api_key',
      status: 'connected',
      granted_capabilities: ['agent_execution'],
      token_ref: input.secretRef,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Could not save the connection: ${error.message}`)
  return { accountId: String((data as { id: string }).id) }
}

export interface AgentCredential {
  /** Which env var Claude Code expects for this kind of credential. */
  envName: 'ANTHROPIC_API_KEY' | 'CLAUDE_CODE_OAUTH_TOKEN'
  value: string
  accountLabel: string
}

/**
 * The user's agent credential, unsealed at the last possible moment.
 *
 * Returns null when nothing is connected — the caller turns that into an
 * honest "connect your Claude account first", never a fallback onto 2Hands'
 * own keys. Falling back would silently convert the user's work into our
 * billing and break the delegation model.
 */
export async function resolveAgentCredential(userId: string): Promise<AgentCredential | null> {
  const admin = createAdminClient()
  const { data } = await table(admin, 'provider_accounts')
    .select('token_ref, external_account_label')
    .eq('user_id', userId)
    .eq('provider_id', AGENT_PROVIDER_ID)
    .eq('status', 'connected')
    .not('token_ref', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)

  const row = (data as Array<{ token_ref: string; external_account_label: string | null }>)?.[0]
  if (!row) return null

  const { data: secretData, error } = await rpc(admin, 'v3_load_protected_secret', {
    p_secret_ref: row.token_ref,
  })
  if (error) throw new Error('secret_load_failed')
  const secretRow = (Array.isArray(secretData) ? secretData[0] : secretData) as
    | {
        key_id: string
        salt_hex: string
        nonce_hex: string
        ciphertext_hex: string
        aad_context: SecretContext
      }
    | undefined
  if (!secretRow) return null

  const stored: StoredCiphertext = {
    keyId: secretRow.key_id,
    saltHex: secretRow.salt_hex,
    nonceHex: secretRow.nonce_hex,
    ciphertextHex: secretRow.ciphertext_hex,
  }
  const value = decryptSecretValue(
    stored,
    secretRow.aad_context,
    envKeyProvider({
      SECRET_BROKER_MASTER_KEY: process.env.SECRET_BROKER_MASTER_KEY,
      SECRET_BROKER_KEY_ID: process.env.SECRET_BROKER_KEY_ID,
    }),
  )

  return {
    // Claude Code's own convention: OAuth tokens (subscription auth, from
    // `claude setup-token`) are sk-ant-oat…; API keys use ANTHROPIC_API_KEY.
    envName: value.startsWith('sk-ant-oat') ? 'CLAUDE_CODE_OAUTH_TOKEN' : 'ANTHROPIC_API_KEY',
    value,
    accountLabel: row.external_account_label ?? 'Claude',
  }
}
