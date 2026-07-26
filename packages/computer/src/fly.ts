/**
 * FlyComputerProvider — hosted computers on Fly Machines.
 *
 * This is the adapter the v3 design left as a seam (COMPUTER_PROVIDER=fly).
 * It is what makes "I don't need a laptop" true: a computer is a Fly Machine
 * with a persistent volume mounted at /workspace, living in one Fly app. The
 * machine is stopped whenever no task is running, so an idle computer bills
 * only for its volume — and everything under /workspace is exactly where the
 * user left it when they come back.
 *
 * Shape:
 *   computer  → one Machine (stopped by default) + one Volume
 *   session   → that Machine started for the duration of a task
 *   checkpoint→ a Volume snapshot
 *
 * Cost control is deliberate, not incidental. Fly has no hard spend cap, so
 * the ceiling has to come from the shape of what we create: small guests,
 * small volumes, machines that are stopped unless a task is live, a hard cap
 * on how many computers may exist, and a session timeout that stops the
 * machine even if the caller forgets to.
 */
import type {
  ComputerProvider,
  ComputerSession,
  ComputerState,
  ComputerWorkspace,
} from '@2hands/types/v3'

const FLY_API = 'https://api.machines.dev/v1'

/** Where the user's durable data lives inside the machine. */
export const WORKSPACE_MOUNT = '/workspace'

export interface FlyProviderOptions {
  /** Org token. Never logged; never persisted by this module. */
  apiToken: string
  /** The Fly app that holds every user computer. */
  appName: string
  region?: string
  /** Base image for a computer. */
  defaultImage?: string
  cpus?: number
  memoryMb?: number
  volumeSizeGb?: number
  /**
   * Refuse to create more computers than this. A runaway loop creating
   * machines is the realistic way to spend real money by accident.
   */
  maxComputers?: number
  /**
   * Monthly ceiling in USD. Enforced against the worst case — every computer
   * running 24/7 — because Fly has no hard spend cap of its own and a machine
   * nobody remembered to stop is exactly how a test bill becomes a real one.
   */
  monthlyBudgetUsd?: number
  now?: () => Date
}

/**
 * Fly's published rates, USD (fly.io/docs/about/pricing).
 *
 * Only what this provider can actually provision is listed. Compute is billed
 * per second and a stopped machine bills none of it; a volume is billed on
 * provisioned capacity whether or not anything is running, which makes it the
 * real floor under an idle computer.
 */
const COMPUTE_USD_PER_HOUR: Record<number, number> = {
  256: 0.0027,
  512: 0.0044,
  1024: 0.0079,
  2048: 0.0149,
}
const VOLUME_USD_PER_GB_MONTH = 0.15
const HOURS_PER_MONTH = 730

/**
 * What a computer gets on each 2Hands plan.
 *
 * Sized so the worst case — the machine never stopping for a whole month —
 * stays a modest fraction of what the plan charges. Real usage is a fraction of
 * that again, because a computer only runs while a task does.
 *
 *   free     $0    512MB / 1GB    up to  $3.34/mo
 *   pro      $20     1GB / 5GB    up to  $6.45/mo
 *   pro_5x   $100    2GB / 20GB   up to $13.70/mo
 *   pro_20x  $200    2GB / 50GB   up to $18.20/mo
 *
 * 2GB is the ceiling here only because it is the largest guest we have a
 * published rate for; the budget guard refuses sizes it cannot price, which is
 * the point. Add the rate to COMPUTE_USD_PER_HOUR before offering a bigger one.
 */
export type PlanId = 'free' | 'pro' | 'pro_5x' | 'pro_20x'

export interface PlanMachineSpec {
  cpus: number
  memoryMb: number
  volumeGb: number
}

export const PLAN_MACHINE_SPECS: Record<PlanId, PlanMachineSpec> = {
  free: { cpus: 1, memoryMb: 512, volumeGb: 1 },
  pro: { cpus: 1, memoryMb: 1024, volumeGb: 5 },
  pro_5x: { cpus: 2, memoryMb: 2048, volumeGb: 20 },
  pro_20x: { cpus: 2, memoryMb: 2048, volumeGb: 50 },
}

/** Worst case for one computer: running every hour of the month. */
export function worstCaseMonthlyUsd(memoryMb: number, volumeGb: number): number {
  const hourly = COMPUTE_USD_PER_HOUR[memoryMb]
  if (hourly === undefined) {
    throw new Error(
      `No published Fly rate for ${memoryMb}MB — add it to COMPUTE_USD_PER_HOUR ` +
        'rather than guessing, or the budget guard is meaningless.',
    )
  }
  return hourly * HOURS_PER_MONTH + volumeGb * VOLUME_USD_PER_GB_MONTH
}

interface FlyMachine {
  id: string
  name: string
  state: string
  region: string
  config?: Record<string, unknown>
}

interface FlyVolume {
  id: string
  name: string
  size_gb: number
}

/** Fly machine states → the provider-neutral contract. */
function toComputerState(flyState: string): ComputerState {
  switch (flyState) {
    case 'created':
    case 'stopped':
    case 'suspended':
      return 'stopped'
    case 'starting':
    case 'replacing':
      return 'starting'
    case 'started':
      return 'ready'
    case 'stopping':
    case 'suspending':
      return 'stopping'
    case 'destroying':
      return 'deleting'
    case 'destroyed':
      return 'deleted'
    default:
      return 'failed'
  }
}

export class FlyComputerProvider implements ComputerProvider {
  readonly id = 'fly'

  private readonly opts: Required<Omit<FlyProviderOptions, 'apiToken' | 'now'>> & {
    apiToken: string
    now: () => Date
  }

  constructor(options: FlyProviderOptions) {
    if (!options.apiToken) throw new Error('FlyComputerProvider requires an API token')
    if (!options.appName) throw new Error('FlyComputerProvider requires an app name')

    this.opts = {
      apiToken: options.apiToken,
      appName: options.appName,
      region: options.region ?? 'arn',
      defaultImage: options.defaultImage ?? 'ubuntu:24.04',
      cpus: options.cpus ?? 1,
      memoryMb: options.memoryMb ?? 512,
      volumeSizeGb: options.volumeSizeGb ?? 1,
      maxComputers: options.maxComputers ?? 10,
      monthlyBudgetUsd: options.monthlyBudgetUsd ?? 50,
      now: options.now ?? (() => new Date()),
    }

    // Fail at construction, not at 3am on an invoice: if the configured size
    // and count cannot fit the budget even in principle, say so now.
    const perComputer = worstCaseMonthlyUsd(this.opts.memoryMb, this.opts.volumeSizeGb)
    const affordable = Math.floor(this.opts.monthlyBudgetUsd / perComputer)
    if (affordable < 1) {
      throw new Error(
        `A single ${this.opts.memoryMb}MB computer with a ${this.opts.volumeSizeGb}GB volume ` +
          `costs up to $${perComputer.toFixed(2)}/month, over the $${this.opts.monthlyBudgetUsd} budget.`,
      )
    }
    this.affordableComputers = Math.min(this.opts.maxComputers, affordable)
  }

  /** How many computers fit inside the budget at the configured size. */
  private readonly affordableComputers: number

  // -------------------------------------------------------------------------
  // HTTP

  private async api<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${FLY_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.opts.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const text = await res.text()
    if (!res.ok) {
      // Deliberately does not echo the request body — it can carry
      // environment values for the machine.
      throw new Error(`Fly API ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`)
    }
    return (text ? JSON.parse(text) : undefined) as T
  }

  private machineName(computerId: string) {
    return `c-${computerId}`.slice(0, 63)
  }

  private volumeName(computerId: string) {
    // Fly volume names allow letters, numbers and underscores only.
    return `v_${computerId.replace(/-/g, '')}`.slice(0, 30)
  }

  // -------------------------------------------------------------------------
  // Contract

  async createWorkspace(input: {
    workspaceId: string
    userId: string
    name: string
    imageRef: string
    region?: string
  }): Promise<ComputerWorkspace> {
    const existing = await this.api<FlyMachine[]>('GET', `/apps/${this.opts.appName}/machines`)
    if (existing.length >= this.affordableComputers) {
      const perComputer = worstCaseMonthlyUsd(this.opts.memoryMb, this.opts.volumeSizeGb)
      throw new Error(
        `Refusing to create computer ${existing.length + 1}: at $${perComputer.toFixed(2)}/month ` +
          `worst case each, ${this.affordableComputers} is what fits the ` +
          `$${this.opts.monthlyBudgetUsd} budget. Raise FLY_MONTHLY_BUDGET_USD deliberately, ` +
          'or use smaller machines.',
      )
    }

    const id = crypto.randomUUID()
    const region = input.region ?? this.opts.region

    const volume = await this.api<FlyVolume>('POST', `/apps/${this.opts.appName}/volumes`, {
      name: this.volumeName(id),
      region,
      size_gb: this.opts.volumeSizeGb,
      encrypted: true,
    })

    // skip_launch: created stopped. A computer costs nothing but its volume
    // until a task actually needs it.
    const machine = await this.api<FlyMachine>('POST', `/apps/${this.opts.appName}/machines`, {
      name: this.machineName(id),
      region,
      skip_launch: true,
      config: {
        image: input.imageRef || this.opts.defaultImage,
        guest: { cpu_kind: 'shared', cpus: this.opts.cpus, memory_mb: this.opts.memoryMb },
        mounts: [{ volume: volume.id, path: WORKSPACE_MOUNT }],
        init: { exec: ['sleep', 'infinity'] },
        restart: { policy: 'no' },
        auto_destroy: false,
        metadata: {
          '2hands_computer_id': id,
          '2hands_workspace_id': input.workspaceId,
          '2hands_owner_user_id': input.userId,
        },
      },
    })

    const nowIso = this.opts.now().toISOString()
    return {
      id,
      workspaceId: input.workspaceId,
      ownerUserId: input.userId,
      provider: this.id,
      providerWorkspaceRef: `${machine.id}:${volume.id}`,
      name: input.name,
      state: toComputerState(machine.state),
      imageRef: input.imageRef || this.opts.defaultImage,
      blueprintVersion: 1,
      storageBytes: this.opts.volumeSizeGb * 1024 * 1024 * 1024,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
  }

  async getWorkspace(id: string): Promise<ComputerWorkspace> {
    const machines = await this.api<FlyMachine[]>('GET', `/apps/${this.opts.appName}/machines`)
    const machine = machines.find((m) => m.name === this.machineName(id))
    if (!machine) throw new Error(`No Fly machine for computer ${id}`)

    const meta = (machine.config?.metadata ?? {}) as Record<string, string>
    const nowIso = this.opts.now().toISOString()
    return {
      id,
      workspaceId: meta['2hands_workspace_id'] ?? '',
      ownerUserId: meta['2hands_owner_user_id'] ?? '',
      provider: this.id,
      providerWorkspaceRef: machine.id,
      name: machine.name,
      state: toComputerState(machine.state),
      imageRef: String((machine.config as { image?: string } | undefined)?.image ?? ''),
      blueprintVersion: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
  }

  private machineIdOf(computer: ComputerWorkspace): string {
    const ref = computer.providerWorkspaceRef
    if (!ref) throw new Error(`Computer ${computer.id} has no provider ref`)
    return ref.split(':')[0]
  }

  async startSession(input: {
    computer: ComputerWorkspace
    taskId: string
    timeoutMs: number
    networkPolicyId: string
  }): Promise<ComputerSession> {
    const machineId = this.machineIdOf(input.computer)
    await this.api('POST', `/apps/${this.opts.appName}/machines/${machineId}/start`)

    // Block until the machine is actually usable, so callers never hand work
    // to a machine that is still booting.
    await this.api(
      'GET',
      `/apps/${this.opts.appName}/machines/${machineId}/wait?state=started&timeout=60`,
    )

    const startedAt = this.opts.now()
    return {
      id: crypto.randomUUID(),
      computerId: input.computer.id,
      taskId: input.taskId,
      providerSessionRef: machineId,
      state: 'ready',
      startedAt: startedAt.toISOString(),
      expiresAt: new Date(startedAt.getTime() + input.timeoutMs).toISOString(),
    }
  }

  async stopSession(session: ComputerSession): Promise<ComputerSession> {
    const machineId = session.providerSessionRef
    if (machineId) {
      await this.api('POST', `/apps/${this.opts.appName}/machines/${machineId}/stop`)
    }
    return {
      ...session,
      state: 'stopped',
      stoppedAt: this.opts.now().toISOString(),
    }
  }

  async createCheckpoint(input: {
    computer: ComputerWorkspace
    session?: ComputerSession
    label: string
  }): Promise<{ id: string; createdAt: string }> {
    const volumeId = input.computer.providerWorkspaceRef?.split(':')[1]
    if (!volumeId) throw new Error(`Computer ${input.computer.id} has no volume ref`)

    await this.api('POST', `/apps/${this.opts.appName}/volumes/${volumeId}/snapshots`)

    // Fly assigns the snapshot id asynchronously; the newest one is ours.
    const snapshots = await this.api<Array<{ id: string; created_at: string }>>(
      'GET',
      `/apps/${this.opts.appName}/volumes/${volumeId}/snapshots`,
    )
    const newest = snapshots.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (!newest) throw new Error('Fly reported no snapshot after creating one')

    return { id: newest.id, createdAt: newest.created_at }
  }

  async restoreCheckpoint(input: {
    computer: ComputerWorkspace
    checkpointId: string
  }): Promise<ComputerWorkspace> {
    // Restoring means a new volume built from the snapshot, then pointing the
    // machine at it. Fly cannot swap a mount in place, so the machine is
    // recreated against the restored volume.
    const machineId = this.machineIdOf(input.computer)
    const region = this.opts.region

    const restored = await this.api<FlyVolume>('POST', `/apps/${this.opts.appName}/volumes`, {
      name: this.volumeName(`${input.computer.id}r`),
      region,
      size_gb: this.opts.volumeSizeGb,
      encrypted: true,
      snapshot_id: input.checkpointId,
    })

    await this.api('DELETE', `/apps/${this.opts.appName}/machines/${machineId}?force=true`)

    const machine = await this.api<FlyMachine>('POST', `/apps/${this.opts.appName}/machines`, {
      name: this.machineName(input.computer.id),
      region,
      skip_launch: true,
      config: {
        image: input.computer.imageRef || this.opts.defaultImage,
        guest: { cpu_kind: 'shared', cpus: this.opts.cpus, memory_mb: this.opts.memoryMb },
        mounts: [{ volume: restored.id, path: WORKSPACE_MOUNT }],
        init: { exec: ['sleep', 'infinity'] },
        restart: { policy: 'no' },
        auto_destroy: false,
      },
    })

    return {
      ...input.computer,
      providerWorkspaceRef: `${machine.id}:${restored.id}`,
      state: toComputerState(machine.state),
      lastCheckpointId: input.checkpointId,
      updatedAt: this.opts.now().toISOString(),
    }
  }

  /**
   * Move a computer onto another plan's hardware without losing anything.
   *
   * This is why the design puts user data on a volume rather than in the
   * machine's own filesystem: CPU and RAM live in the machine config, the data
   * lives in the volume, and the two resize independently.
   *
   *   more CPU/RAM → update the machine config in place; the same volume is
   *                  remounted, so /workspace is untouched
   *   more disk    → extend the volume, which grows the filesystem live
   *
   * Downgrades shrink CPU and RAM but never the volume: Fly volumes cannot
   * shrink, and silently discarding a user's files to fit a smaller plan would
   * be the worst possible reading of "downgrade". They keep the disk they had.
   */
  async applyPlan(input: {
    computer: ComputerWorkspace
    plan: PlanId
  }): Promise<ComputerWorkspace> {
    const spec = PLAN_MACHINE_SPECS[input.plan]
    if (!spec) throw new Error(`Unknown plan ${input.plan}`)

    const [machineId, volumeId] = (input.computer.providerWorkspaceRef ?? '').split(':')
    if (!machineId) throw new Error(`Computer ${input.computer.id} has no machine ref`)

    // Disk first. Growing before the machine restarts means the larger
    // filesystem is already there when it comes back up.
    if (volumeId) {
      const volume = await this.api<FlyVolume>(
        'GET',
        `/apps/${this.opts.appName}/volumes/${volumeId}`,
      )
      if (spec.volumeGb > volume.size_gb) {
        await this.api('PUT', `/apps/${this.opts.appName}/volumes/${volumeId}/extend`, {
          size_gb: spec.volumeGb,
        })
      }
    }

    // Fly replaces the whole config on update, so read the current one and
    // change only the guest — dropping the mounts here would detach the
    // volume, which is precisely the data loss this method exists to avoid.
    const machine = await this.api<FlyMachine>(
      'GET',
      `/apps/${this.opts.appName}/machines/${machineId}`,
    )
    const config = { ...(machine.config ?? {}) } as Record<string, unknown>
    config.guest = { cpu_kind: 'shared', cpus: spec.cpus, memory_mb: spec.memoryMb }

    const wasStopped = toComputerState(machine.state) === 'stopped'
    const updated = await this.api<FlyMachine>(
      'POST',
      `/apps/${this.opts.appName}/machines/${machineId}`,
      { config, skip_launch: wasStopped },
    )

    return {
      ...input.computer,
      state: toComputerState(updated.state),
      storageBytes: spec.volumeGb * 1024 * 1024 * 1024,
      updatedAt: this.opts.now().toISOString(),
    }
  }

  async exposePreview(): Promise<{ previewId: string; url: string; expiresAt: string }> {
    // Machines here have private IPs only, on purpose: a user computer should
    // not be reachable from the internet by default. Publishing a port needs a
    // deliberate proxy with its own authorisation, which does not exist yet —
    // so this fails loudly rather than returning a URL that does not work.
    throw new Error(
      'exposePreview is not implemented for the Fly provider: user computers are ' +
        'private by design, and a public preview needs an authorised proxy first.',
    )
  }

  async measureUsage(session: ComputerSession): Promise<ComputerSession> {
    // Fly bills per machine-second; per-session CPU/memory counters are not
    // exposed on the Machines API. Wall time is what we can honestly report,
    // and it is what the machine is billed on.
    const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : null
    const endedAt = session.stoppedAt
      ? new Date(session.stoppedAt).getTime()
      : this.opts.now().getTime()

    if (startedAt === null) return session
    const wallMs = Math.max(0, endedAt - startedAt)

    return {
      ...session,
      activeCpuMs: wallMs * this.opts.cpus,
      memoryGbMs: wallMs * (this.opts.memoryMb / 1024),
    }
  }

  async deleteWorkspace(computer: ComputerWorkspace): Promise<void> {
    const [machineId, volumeId] = (computer.providerWorkspaceRef ?? '').split(':')
    if (machineId) {
      await this.api('DELETE', `/apps/${this.opts.appName}/machines/${machineId}?force=true`)
    }
    if (volumeId) {
      await this.api('DELETE', `/apps/${this.opts.appName}/volumes/${volumeId}`)
    }
  }
}
