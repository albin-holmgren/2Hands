export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')

    // Validate environment configuration at startup so problems surface immediately in logs
    const { logEnvCheck } = await import('./lib/confidence/env-check')
    logEnvCheck()
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

export const onRequestError = async (
  err: Error,
  request: {
    path: string
    method: string
    headers: Record<string, string>
  },
  context: {
    routerKind: 'Pages Router' | 'App Router'
    routePath: string
    routeType: 'render' | 'route' | 'action' | 'middleware'
    renderSource?: 'react-server-components' | 'react-server-components-payload' | 'server-rendering'
    revalidateReason?: 'on-demand' | 'stale' | undefined
    renderType?: 'dynamic' | 'dynamic-resume'
  }
) => {
  const Sentry = await import('@sentry/nextjs')
  
  Sentry.captureException(err, {
    tags: {
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
    },
    extra: {
      method: request.method,
      path: request.path,
    },
  })
}
