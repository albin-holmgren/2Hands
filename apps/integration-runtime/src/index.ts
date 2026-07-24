import { createServer } from 'node:http'

type RuntimeConfig = {
  appUrl: string
  workerUrl: string
  cronSecret: string
  intervalMs: number
  limit: number
  dryRun: boolean
}

function getRequiredEnv(name: string): string {
  const value = (process.env[name] || '').trim()
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function parseIntEnv(name: string, defaultValue: number): number {
  const raw = (process.env[name] || '').trim()
  if (!raw) return defaultValue
  const n = Number(raw)
  return Number.isFinite(n) ? n : defaultValue
}

function parseBoolEnv(name: string, defaultValue: boolean): boolean {
  const raw = (process.env[name] || '').trim().toLowerCase()
  if (!raw) return defaultValue
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function buildConfig(): RuntimeConfig {
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim() || 'http://localhost:3000'

  const workerUrl = (process.env.INTEGRATION_WORKER_URL || '').trim() || `${appUrl.replace(/\/$/, '')}/api/integrations/deliveries/worker`

  const cronSecret = getRequiredEnv('CRON_SECRET')

  const intervalMs = Math.max(500, parseIntEnv('INTEGRATION_WORKER_INTERVAL_MS', 5000))
  const limit = Math.max(1, Math.min(50, parseIntEnv('INTEGRATION_WORKER_LIMIT', 10)))
  const dryRun = parseBoolEnv('INTEGRATION_WORKER_DRY_RUN', false)

  return {
    appUrl,
    workerUrl,
    cronSecret,
    intervalMs,
    limit,
    dryRun,
  }
}

async function drainOnce(config: RuntimeConfig): Promise<void> {
  const url = new URL(config.workerUrl)
  url.searchParams.set('limit', String(config.limit))
  if (config.dryRun) {
    url.searchParams.set('dry_run', 'true')
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.cronSecret}`,
      'Content-Type': 'application/json',
    },
  })

  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  if (!res.ok) {
    console.error('[integration-runtime] Worker call failed', {
      status: res.status,
      body,
    })
    return
  }

  if (typeof body === 'object' && body !== null) {
    const b = body as { processed?: unknown; delivered?: unknown; failed?: unknown }
    const processed = typeof b.processed === 'number' ? b.processed : null
    const delivered = typeof b.delivered === 'number' ? b.delivered : null
    const failed = typeof b.failed === 'number' ? b.failed : null

    if (processed !== null && processed > 0) {
      console.log('[integration-runtime] drain', { processed, delivered, failed })
    }
  }
}

async function main() {
  const config = buildConfig()

  const portRaw = (process.env.PORT || '').trim()
  const port = portRaw ? Number(portRaw) : null
  if (port !== null && Number.isFinite(port) && port > 0) {
    const server = createServer((req, res) => {
      const url = req.url || '/'
      if (url.startsWith('/healthz')) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
        return
      }

      res.statusCode = 404
      res.end('not_found')
    })

    server.listen(port, () => {
      console.log('[integration-runtime] health server listening', { port })
    })
  }

  console.log('[integration-runtime] starting', {
    appUrl: config.appUrl,
    workerUrl: config.workerUrl,
    intervalMs: config.intervalMs,
    limit: config.limit,
    dryRun: config.dryRun,
  })

  let stopped = false
  let inFlight = false

  const stop = () => {
    if (stopped) return
    stopped = true
    console.log('[integration-runtime] stopping')
  }

  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  const tick = async () => {
    if (stopped) return
    if (inFlight) return

    inFlight = true
    try {
      await drainOnce(config)
    } catch (err) {
      console.error('[integration-runtime] drainOnce error', err)
    } finally {
      inFlight = false
    }
  }

  await tick()

  const timer = setInterval(() => {
    void tick()
  }, config.intervalMs)

  while (!stopped) {
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  clearInterval(timer)
}

void main().catch(err => {
  console.error('[integration-runtime] fatal', err)
  process.exit(1)
})
