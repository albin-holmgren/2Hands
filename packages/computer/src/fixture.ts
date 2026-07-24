/**
 * FixtureComputerProvider — deterministic filesystem-backed provider for
 * development and CI where Docker is unavailable. Uses the exact
 * ComputerProvider contract; workspaces are directories, sessions are
 * logical leases over them, checkpoints are tarballs.
 *
 * Clearly a DEMO-grade provider: no kernel isolation. It must never be
 * selected in hosted production (the control plane enforces provider
 * selection by environment).
 */
import { execFile } from 'node:child_process'
import { mkdir, rm, stat, cp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import type { ComputerProvider, ComputerSession, ComputerWorkspace } from '@2hands/types/v3'

const execFileAsync = promisify(execFile)

export interface FixtureProviderOptions {
  /** Base directory holding all fixture computers. */
  baseDir: string
  now?: () => Date
}

export class FixtureComputerProvider implements ComputerProvider {
  readonly id = 'fixture'
  private workspaces = new Map<string, ComputerWorkspace>()
  private sessions = new Map<string, ComputerSession>()

  constructor(private options: FixtureProviderOptions) {}

  workspacePath(computerId: string): string {
    return join(this.options.baseDir, computerId, 'workspace')
  }

  private checkpointDir(computerId: string): string {
    return join(this.options.baseDir, computerId, 'checkpoints')
  }

  private nowIso(): string {
    return (this.options.now?.() ?? new Date()).toISOString()
  }

  async createWorkspace(input: {
    workspaceId: string
    userId: string
    name: string
    imageRef: string
    region?: string
  }): Promise<ComputerWorkspace> {
    const id = randomUUID()
    await mkdir(this.workspacePath(id), { recursive: true })
    await mkdir(this.checkpointDir(id), { recursive: true })
    const workspace: ComputerWorkspace = {
      id,
      workspaceId: input.workspaceId,
      ownerUserId: input.userId,
      provider: this.id,
      providerWorkspaceRef: this.workspacePath(id),
      name: input.name,
      state: 'stopped',
      imageRef: input.imageRef,
      blueprintVersion: 1,
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
    }
    this.workspaces.set(id, workspace)
    return workspace
  }

  async getWorkspace(id: string): Promise<ComputerWorkspace> {
    const workspace = this.workspaces.get(id)
    if (!workspace) throw new Error(`fixture: workspace ${id} not found`)
    return workspace
  }

  async startSession(input: {
    computer: ComputerWorkspace
    taskId: string
    timeoutMs: number
    networkPolicyId: string
  }): Promise<ComputerSession> {
    if (!existsSync(this.workspacePath(input.computer.id))) {
      throw new Error(`fixture: workspace directory missing for ${input.computer.id}`)
    }
    const session: ComputerSession = {
      id: randomUUID(),
      computerId: input.computer.id,
      taskId: input.taskId,
      providerSessionRef: this.workspacePath(input.computer.id),
      state: 'ready',
      startedAt: this.nowIso(),
      expiresAt: new Date(Date.now() + input.timeoutMs).toISOString(),
    }
    this.sessions.set(session.id, session)
    const workspace = this.workspaces.get(input.computer.id)
    if (workspace) workspace.state = 'ready'
    return session
  }

  async stopSession(session: ComputerSession): Promise<ComputerSession> {
    const stored = this.sessions.get(session.id) ?? session
    stored.state = 'stopped'
    stored.stoppedAt = this.nowIso()
    this.sessions.set(stored.id, stored)
    const workspace = this.workspaces.get(stored.computerId)
    if (workspace) workspace.state = 'stopped'
    return stored
  }

  async createCheckpoint(input: {
    computer: ComputerWorkspace
    session?: ComputerSession
    label: string
  }): Promise<{ id: string; createdAt: string }> {
    const id = randomUUID()
    const target = join(this.checkpointDir(input.computer.id), `${id}.tar.gz`)
    await execFileAsync('tar', ['czf', target, '-C', this.workspacePath(input.computer.id), '.'])
    return { id, createdAt: this.nowIso() }
  }

  async restoreCheckpoint(input: {
    computer: ComputerWorkspace
    checkpointId: string
  }): Promise<ComputerWorkspace> {
    const source = join(this.checkpointDir(input.computer.id), `${input.checkpointId}.tar.gz`)
    if (!existsSync(source)) throw new Error(`fixture: checkpoint ${input.checkpointId} not found`)
    const workspacePath = this.workspacePath(input.computer.id)
    await rm(workspacePath, { recursive: true, force: true })
    await mkdir(workspacePath, { recursive: true })
    await execFileAsync('tar', ['xzf', source, '-C', workspacePath])
    const workspace = await this.getWorkspace(input.computer.id)
    workspace.lastCheckpointId = input.checkpointId
    workspace.updatedAt = this.nowIso()
    return workspace
  }

  async exposePreview(input: {
    session: ComputerSession
    port: number
    expiresAt: string
    userId: string
  }): Promise<{ previewId: string; url: string; expiresAt: string }> {
    // Fixture previews point at localhost; the authenticated proxy layer in
    // the control plane wraps this URL with a signed, expiring token.
    return {
      previewId: randomUUID(),
      url: `http://127.0.0.1:${input.port}`,
      expiresAt: input.expiresAt,
    }
  }

  async measureUsage(session: ComputerSession): Promise<ComputerSession> {
    const stored = this.sessions.get(session.id) ?? session
    const started = stored.startedAt ? new Date(stored.startedAt).getTime() : Date.now()
    const stopped = stored.stoppedAt ? new Date(stored.stoppedAt).getTime() : Date.now()
    stored.activeCpuMs = Math.max(0, stopped - started)
    try {
      const s = await stat(this.workspacePath(stored.computerId))
      stored.networkEgressBytes = 0
      stored.networkIngressBytes = 0
      void s
    } catch {
      /* workspace gone */
    }
    return stored
  }

  async deleteWorkspace(computer: ComputerWorkspace): Promise<void> {
    await rm(join(this.options.baseDir, computer.id), { recursive: true, force: true })
    this.workspaces.delete(computer.id)
    const workspace = this.workspaces.get(computer.id)
    if (workspace) workspace.state = 'deleted'
  }

  /** Seed helper for tests/demo: copy a fixture repository into a workspace. */
  async seedWorkspace(computerId: string, sourceDir: string): Promise<void> {
    await cp(sourceDir, this.workspacePath(computerId), { recursive: true })
  }
}
