const PAPERSPACE_API_URL = 'https://api.paperspace.io'

interface PaperspaceConfig {
  apiKey: string
}

interface MachineCreateParams {
  region: string
  machineType: string
  size: number
  billingType: 'hourly' | 'monthly'
  machineName: string
  templateId: string
  assignPublicIp?: boolean
  startOnCreate?: boolean
  scriptId?: string
}

interface Machine {
  id: string
  name: string
  state: 'off' | 'starting' | 'stopping' | 'restarting' | 'serviceready' | 'ready' | 'upgrading' | 'provisioning'
  machineType: string
  region: string
  publicIpAddress: string | null
  privateIpAddress: string | null
  os: string
  cpus: number
  ram: string
  gpu: string | null
  storageTotal: string
  storageUsed: string
  usageRate: string
  shutdownTimeoutInHours: number | null
  shutdownTimeoutForces: boolean
  performAutoSnapshot: boolean
  autoSnapshotFrequency: string | null
  autoSnapshotSaveCount: number | null
  dynamicPublicIp: boolean | null
  agentType: string
  dtCreated: string
  dtLastRun: string | null
}

interface MachineListResponse {
  machines: Machine[]
}

export class PaperspaceClient {
  private apiKey: string

  constructor(config: PaperspaceConfig) {
    this.apiKey = config.apiKey
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${PAPERSPACE_API_URL}${endpoint}`
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Paperspace API error: ${response.status} - ${errorText}`)
    }

    return response.json()
  }

  async createMachine(params: MachineCreateParams): Promise<Machine> {
    return this.request<Machine>('POST', '/machines/createSingleMachinePublic', {
      region: params.region,
      machineType: params.machineType,
      size: params.size,
      billingType: params.billingType,
      machineName: params.machineName,
      templateId: params.templateId,
      assignPublicIp: params.assignPublicIp ?? true,
      scriptId: params.scriptId,
      startOnCreate: params.startOnCreate ?? true,
    })
  }

  async getMachine(machineId: string): Promise<Machine> {
    return this.request<Machine>('GET', `/machines/getMachinePublic?machineId=${machineId}`)
  }

  async listMachines(): Promise<Machine[]> {
    const response = await this.request<MachineListResponse>('GET', '/machines/getMachines')
    return response.machines || []
  }

  async startMachine(machineId: string): Promise<void> {
    await this.request<void>('POST', '/machines/start', { machineId })
  }

  async stopMachine(machineId: string): Promise<void> {
    await this.request<void>('POST', '/machines/stop', { machineId })
  }

  async restartMachine(machineId: string): Promise<void> {
    await this.request<void>('POST', '/machines/restart', { machineId })
  }

  async destroyMachine(machineId: string): Promise<void> {
    await this.request<void>('POST', '/machines/destroy', { machineId })
  }

  async waitForMachineReady(machineId: string, timeoutMs = 300000): Promise<Machine> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeoutMs) {
      const machine = await this.getMachine(machineId)
      
      if (machine.state === 'ready' || machine.state === 'serviceready') {
        return machine
      }
      
      if (machine.state === 'off') {
        throw new Error('Machine failed to start')
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
    
    throw new Error('Timeout waiting for machine to be ready')
  }
}

export function createPaperspaceClient(): PaperspaceClient {
  const apiKey = process.env.PAPERSPACE_API_KEY
  
  if (!apiKey) {
    throw new Error('PAPERSPACE_API_KEY is required for VM provisioning')
  }
  
  return new PaperspaceClient({ apiKey })
}

export const UBUNTU_DESKTOP_TEMPLATE = 't0nspur5'

function parseDiskEnv(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  if (!Number.isFinite(n)) return fallback
  const rounded = Math.round(n)
  return Math.max(min, Math.min(max, rounded))
}

export const DEFAULT_MACHINE_TYPE = (process.env.PAPERSPACE_MACHINE_TYPE || '').trim().toUpperCase() || 'C5'
export const DEFAULT_REGION = (process.env.PAPERSPACE_REGION || '').trim().toUpperCase() || 'NY2'
export const DEFAULT_DISK_SIZE = parseDiskEnv(process.env.PAPERSPACE_DISK_GB || process.env.PAPERSPACE_DISK_SIZE, 50, 50, 200)
