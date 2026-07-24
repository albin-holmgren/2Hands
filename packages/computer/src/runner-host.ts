/**
 * Runner host — executes runner operations for a session AFTER validating
 * the signed job lease. For the local/fixture providers this boundary runs
 * in the control-plane process; for hosted providers the same protocol code
 * runs inside the sandbox (open-source runner). Either way: no lease, no
 * operation.
 */
import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  isPathAllowed,
  validateRunnerLease,
  type RunnerJobLeaseWithNonce,
} from './lease-types'
import { redactText } from '@2hands/secret-broker'
import type { CommandRequest, CommandResult, RunnerJobLease } from '@2hands/types/v3'

export interface RunnerHostOptions {
  signingKeyHex: string
  /** Session/computer identity this host is bound to. */
  sessionId: string
  computerId: string
  /** Root of the workspace on the host filesystem (fixture) or in-container path. */
  workspaceRoot: string
  /** Live secret values to scrub from all output (usually empty). */
  secretValues?: string[]
  /** Emit safe runner events. */
  onEvent?: (type: string, payload: Record<string, unknown>) => void
  /** Command executor — defaults to direct child_process (fixture provider). */
  exec?: (
    command: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
  ) => Promise<{ exitCode: number | null; stdout: string; stderr: string; signal?: string }>
}

const DENYLISTED_COMMANDS = new Set(['sudo', 'su', 'reboot', 'shutdown', 'mount', 'umount'])

export class RunnerHost {
  private seenNonces = new Set<string>()

  constructor(private options: RunnerHostOptions) {}

  /**
   * Run one command under a lease. Validates signature, expiry, nonce,
   * session binding, operation grant, and path jail (lexical + realpath).
   */
  async runCommand(lease: RunnerJobLease, request: CommandRequest): Promise<CommandResult> {
    const startedAt = new Date().toISOString()
    const validation = validateRunnerLease({
      lease: lease as RunnerJobLeaseWithNonce,
      signingKeyHex: this.options.signingKeyHex,
      operation: 'run_command',
      targetPath: request.cwd,
      sessionId: this.options.sessionId,
      computerId: this.options.computerId,
      seenNonces: this.seenNonces,
    })
    if (!validation.valid) {
      this.options.onEvent?.('runner.lease.rejected', { reason: validation.reason, leaseId: lease.id })
      throw new Error(`runner: lease rejected (${validation.reason})`)
    }
    this.seenNonces.add(lease.nonce)

    if (DENYLISTED_COMMANDS.has(request.command)) {
      throw new Error('runner: command denied by policy')
    }

    // realpath half of the path jail: the cwd must resolve inside an allowed
    // path after symlink resolution.
    if (!existsSync(request.cwd)) {
      throw new Error('runner: cwd does not exist')
    }
    const resolved = await realpath(request.cwd)
    // Resolve allowed prefixes too: on macOS /tmp and /var are symlinks, so
    // both sides must be canonicalized before prefix comparison.
    const resolvedAllowed = await Promise.all(
      lease.allowedPaths.map(async (p) => {
        try {
          return await realpath(p)
        } catch {
          return p
        }
      }),
    )
    const jail = isPathAllowed(resolved, resolvedAllowed)
    if (!jail.allowed) {
      this.options.onEvent?.('runner.lease.rejected', { reason: `realpath_${jail.reason}`, leaseId: lease.id })
      throw new Error(`runner: cwd escapes jail (${jail.reason})`)
    }

    this.options.onEvent?.('runner.command.started', {
      leaseId: lease.id,
      command: request.command,
      argCount: request.args.length,
    })

    const timeoutMs = Math.min(request.timeoutMs, lease.maximumRuntimeMs)
    const exec = this.options.exec ?? defaultExec
    const result = await exec(request.command, request.args, resolved, timeoutMs)

    const secrets = this.options.secretValues ?? []
    const stdout = redactText(result.stdout.slice(0, 512_000), secrets)
    const stderr = redactText(result.stderr.slice(0, 512_000), secrets)

    const commandResult: CommandResult = {
      id: randomUUID(),
      exitCode: result.exitCode,
      signal: result.signal,
      safeStdoutRef: stdout.text,
      safeStderrRef: stderr.text,
      startedAt,
      completedAt: new Date().toISOString(),
      redactionsApplied: stdout.redactionsApplied + stderr.redactionsApplied,
    }

    this.options.onEvent?.('runner.command.completed', {
      leaseId: lease.id,
      exitCode: commandResult.exitCode,
      redactionsApplied: commandResult.redactionsApplied,
    })
    return commandResult
  }
}

async function defaultExec(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; signal?: string }> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        // Scrubbed environment: never inherit control-plane secrets.
        env: {
          PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
          HOME: cwd,
          LANG: 'C.UTF-8',
          CI: 'true',
        } as unknown as NodeJS.ProcessEnv,
      },
      (error, stdout, stderr) => {
        if (error && typeof (error as NodeJS.ErrnoException).code === 'string') {
          // Spawn failure (ENOENT etc.) — not a command exit.
          resolve({ exitCode: 127, stdout: String(stdout), stderr: `${String(stderr)}\n${(error as Error).message}` })
          return
        }
        const exitCode = error ? ((error as { code?: number }).code ?? 1) : 0
        const signal = error ? ((error as { signal?: string }).signal ?? undefined) : undefined
        resolve({ exitCode: typeof exitCode === 'number' ? exitCode : 1, stdout: String(stdout), stderr: String(stderr), signal })
      },
    )
  })
}
