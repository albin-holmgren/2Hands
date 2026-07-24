/**
 * 2Hands v3 provider-neutral Computer contracts.
 * Copied verbatim from 2hands-ai-documentation-v3/specs/computer-provider.types.ts (canonical).
 */

export type ComputerState =
  | 'creating'
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'failed'
  | 'deleting'
  | 'deleted'

export interface ComputerWorkspace {
  id: string
  workspaceId: string
  ownerUserId: string
  provider: string
  providerWorkspaceRef?: string
  name: string
  state: ComputerState
  imageRef: string
  blueprintVersion: number
  storageBytes?: number
  lastCheckpointId?: string
  createdAt: string
  updatedAt: string
}

export type ComputerSessionState = 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed' | 'expired'

export interface ComputerSession {
  id: string
  computerId: string
  taskId: string
  providerSessionRef?: string
  state: ComputerSessionState
  startedAt?: string
  stoppedAt?: string
  expiresAt: string
  activeCpuMs?: number
  memoryGbMs?: number
  networkIngressBytes?: number
  networkEgressBytes?: number
}

export interface EnvironmentBlueprint {
  version: 1
  baseImage: { name: string; digest: string }
  runtimes: Record<string, string>
  setup: Array<{ command: string; reason: string }>
  verify: Array<{ command: string; name: string }>
  preview?: { command: string; port: number }
  network: {
    setupAllow: string[]
    executionAllow: string[]
  }
}

export type RunnerOperation =
  | 'read_file'
  | 'write_file'
  | 'patch_file'
  | 'run_command'
  | 'git'
  | 'process'
  | 'preview'
  | 'agent'

export interface RunnerJobLease {
  id: string
  workspaceId: string
  userId: string
  computerId: string
  sessionId: string
  taskId: string
  allowedPaths: string[]
  allowedOperations: RunnerOperation[]
  commandPolicyId: string
  networkPolicyId: string
  maximumRuntimeMs: number
  maximumCredits: number
  publishAllowed: boolean
  expiresAt: string
  nonce: string
  signature: string
}

export interface CommandRequest {
  leaseId: string
  command: string
  args: string[]
  cwd: string
  environmentRefs?: string[]
  timeoutMs: number
  idempotencyKey: string
}

export interface CommandResult {
  id: string
  exitCode: number | null
  signal?: string
  safeStdoutRef?: string
  safeStderrRef?: string
  startedAt: string
  completedAt: string
  redactionsApplied: number
}

export interface ComputerProvider {
  readonly id: string
  createWorkspace(input: {
    workspaceId: string
    userId: string
    name: string
    imageRef: string
    region?: string
  }): Promise<ComputerWorkspace>
  getWorkspace(id: string): Promise<ComputerWorkspace>
  startSession(input: {
    computer: ComputerWorkspace
    taskId: string
    timeoutMs: number
    networkPolicyId: string
  }): Promise<ComputerSession>
  stopSession(session: ComputerSession): Promise<ComputerSession>
  createCheckpoint(input: {
    computer: ComputerWorkspace
    session?: ComputerSession
    label: string
  }): Promise<{ id: string; createdAt: string }>
  restoreCheckpoint(input: {
    computer: ComputerWorkspace
    checkpointId: string
  }): Promise<ComputerWorkspace>
  exposePreview(input: {
    session: ComputerSession
    port: number
    expiresAt: string
    userId: string
  }): Promise<{ previewId: string; url: string; expiresAt: string }>
  measureUsage(session: ComputerSession): Promise<ComputerSession>
  deleteWorkspace(computer: ComputerWorkspace): Promise<void>
}

export interface AgentJobEnvelope {
  id: string
  taskId: string
  sessionId: string
  leaseId: string
  agent: 'codex' | 'claude' | string
  role: 'implementer' | 'reviewer' | 'verifier'
  worktreePath: string
  objective: string
  constraints: string[]
  verificationCommands: string[]
  capabilityGrantIds: string[]
  approvalPolicy: { publishAllowed: false; deployAllowed: false }
}
