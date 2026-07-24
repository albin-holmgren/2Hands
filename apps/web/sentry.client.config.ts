import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Session replay for debugging user issues
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Only enable in production
  enabled: process.env.NODE_ENV === 'production',
  
  // Environment tag
  environment: process.env.NODE_ENV,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out noisy errors
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Network request failed',
    'Load failed',
    'Failed to fetch',
  ],

  beforeSend(event) {
    // Add request ID if available
    if (typeof window !== 'undefined') {
      const requestId = document.querySelector('meta[name="x-request-id"]')?.getAttribute('content')
      if (requestId) {
        event.tags = { ...event.tags, requestId }
      }
    }
    return event
  },
})
