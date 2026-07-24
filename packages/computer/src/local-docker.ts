/**
 * LocalDockerComputerProvider — deterministic Docker-backed provider for
 * development, CI, and self-hosting. Persistent state lives in a named
 * volume per computer; compute is a disposable container per session.
 *
 * Isolation defaults:
 *   - network `none` unless the network policy explicitly allows egress
 *   - memory/cpu limits per session
 *   - no host filesystem mounts beyond the computer volume
 *   - containers labeled for orphan cleanup
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import type { ComputerProvider, ComputerSession, ComputerWorkspace } from '@2hands/types/v3'

const execFileAsync = promisify(execFile)

const LABEL = '2hands.computer'

export interface DockerProviderOptions {
  /** Default container image for sessions. */
  defaultImage?: string
  memoryLimit?: string
  cpuLimit?: string
  now?: () => Date
}

async function docker(args: string[], timeoutMs = 120_000): Promise<string> {
  const { stdout } = await execFileAsync('docker', args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 })
  return stdout.trim()
}

export class LocalDockerComputerProvider implements ComputerProvider {
  readonly id = 'local-docker'
  private workspaces = new Map<string, ComputerWorkspace>()
  private sessions = new Map<string, ComputerSession>()

  constructor(private options: DockerProviderOptions = {}) {}

  private nowIso(): string {
    return (this.options.now?.() ?? new Date()).toISOString()
  }

  volumeName(computerId: string): string {
    return `2hands-comp-${computerId}`
  }

  containerName(sessionId: string): string {
    return `2hands-sess-${sessionId}`
  }

  static async available(): Promise<boolean> {
    try {
      await docker(['info', '--format', '{{.ServerVersion}}'], 10_000)
      return true
    } catch {
      return false
    }
  }

  async createWorkspace(input: {
    workspaceId: string
    userId: string
    name: string
    imageRef: string
    region?: string
  }): Promise<ComputerWorkspace> {
    const id = randomUUID()
    await docker(['volume', 'create', '--label', `${LABEL}=${id}`, this.volumeName(id)])
    const workspace: ComputerWorkspace = {
      id,
      workspaceId: input.workspaceId,
      ownerUserId: input.userId,
      provider: this.id,
      providerWorkspaceRef: this.volumeName(id),
      name: input.name,
      state: 'stopped',
      imageRef: input.imageRef || this.options.defaultImage || 'node:20-bookworm-slim',
      blueprintVersion: 1,
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
    }
    this.workspaces.set(id, workspace)
    return workspace
  }

  async getWorkspace(id: string): Promise<ComputerWorkspace> {
    const workspace = this.workspaces.get(id)
    if (!workspace) throw new Error(`local-docker: workspace ${id} not found`)
    return workspace
  }

  /** Rehydrate provider state from an external record (control-plane DB). */
  registerWorkspace(workspace: ComputerWorkspace): void {
    this.workspaces.set(workspace.id, workspace)
  }

  async startSession(input: {
    computer: ComputerWorkspace
    taskId: string
    timeoutMs: number
    networkPolicyId: string
  }): Promise<ComputerSession> {
    const sessionId = randomUUID()
    // Deny-by-default egress: policy id must OPT IN to any network at all.
    const network = input.networkPolicyId.startsWith('allow') ? 'bridge' : 'none'
    await docker([
      'run',
      '-d',
      '--name', this.containerName(sessionId),
      '--label', `${LABEL}=${input.computer.id}`,
      '--label', `${LABEL}.session=${sessionId}`,
      '--network', network,
      '--memory', this.options.memoryLimit ?? '2g',
      '--cpus', this.options.cpuLimit ?? '2',
      '--workdir', '/workspace',
      '-v', `${this.volumeName(input.computer.id)}:/workspace`,
      input.computer.imageRef,
      'sleep', 'infinity',
    ])
    const session: ComputerSession = {
      id: sessionId,
      computerId: input.computer.id,
      taskId: input.taskId,
      providerSessionRef: this.containerName(sessionId),
      state: 'ready',
      startedAt: this.nowIso(),
      expiresAt: new Date(Date.now() + input.timeoutMs).toISOString(),
    }
    this.sessions.set(sessionId, session)
    const workspace = this.workspaces.get(input.computer.id)
    if (workspace) workspace.state = 'ready'
    return session
  }

  /** Execute a command inside a running session (runner-host exec bridge). */
  async execInSession(
    sessionId: string,
    command: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string; signal?: string }> {
    return new Promise((resolve) => {
      execFile(
        'docker',
        ['exec', '--workdir', cwd, this.containerName(sessionId), command, ...args],
        { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const exitCode = error ? ((error as { code?: number }).code ?? 1) : 0
          resolve({
            exitCode: typeof exitCode === 'number' ? exitCode : 1,
            stdout: String(stdout),
            stderr: String(stderr),
            signal: error ? ((error as { signal?: string }).signal ?? undefined) : undefined,
          })
        },
      )
    })
  }

  async stopSession(session: ComputerSession): Promise<ComputerSession> {
    try {
      await docker(['rm', '-f', this.containerName(session.id)])
    } catch {
      /* already gone */
    }
    const stored = this.sessions.get(session.id) ?? session
    stored.state = 'stopped'
    stored.stoppedAt = this.nowIso()
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
    // Tar the volume into a checkpoint volume via a throwaway container.
    await docker([
      'run', '--rm',
      '--network', 'none',
      '-v', `${this.volumeName(input.computer.id)}:/workspace:ro`,
      '-v', `${this.volumeName(input.computer.id)}-ckpt:/checkpoints`,
      input.computer.imageRef,
      'tar', 'czf', `/checkpoints/${id}.tar.gz`, '-C', '/workspace', '.',
    ], 300_000)
    return { id, createdAt: this.nowIso() }
  }

  async restoreCheckpoint(input: {
    computer: ComputerWorkspace
    checkpointId: string
  }): Promise<ComputerWorkspace> {
    await docker([
      'run', '--rm',
      '--network', 'none',
      '-v', `${this.volumeName(input.computer.id)}:/workspace`,
      '-v', `${this.volumeName(input.computer.id)}-ckpt:/checkpoints:ro`,
      input.computer.imageRef,
      'sh', '-c',
      `rm -rf /workspace/* /workspace/.[!.]* 2>/dev/null; tar xzf /checkpoints/${input.checkpointId}.tar.gz -C /workspace`,
    ], 300_000)
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
    // Local preview: discover the container IP on its network; the
    // authenticated preview proxy in the control plane fronts this URL.
    const ip = await docker([
      'inspect', '-f', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
      this.containerName(input.session.id),
    ])
    return {
      previewId: randomUUID(),
      url: ip ? `http://${ip}:${input.port}` : `http://127.0.0.1:${input.port}`,
      expiresAt: input.expiresAt,
    }
  }

  async measureUsage(session: ComputerSession): Promise<ComputerSession> {
    const stored = this.sessions.get(session.id) ?? session
    try {
      const stats = await docker([
        'stats', '--no-stream', '--format', '{{.CPUPerc}}|{{.MemUsage}}',
        this.containerName(session.id),
      ], 15_000)
      void stats
    } catch {
      /* container stopped */
    }
    const started = stored.startedAt ? new Date(stored.startedAt).getTime() : Date.now()
    const stopped = stored.stoppedAt ? new Date(stored.stoppedAt).getTime() : Date.now()
    stored.activeCpuMs = Math.max(0, stopped - started)
    return stored
  }

  async deleteWorkspace(computer: ComputerWorkspace): Promise<void> {
    // Remove any session containers, then volumes.
    try {
      const containers = await docker(['ps', '-aq', '--filter', `label=${LABEL}=${computer.id}`])
      if (containers) await docker(['rm', '-f', ...containers.split('\n')])
    } catch {
      /* none */
    }
    try {
      await docker(['volume', 'rm', '-f', this.volumeName(computer.id), `${this.volumeName(computer.id)}-ckpt`])
    } catch {
      /* already gone */
    }
    this.workspaces.delete(computer.id)
  }
}
