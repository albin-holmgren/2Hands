import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  
  // Performance monitoring - lower rate for server
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Only enable in production
  enabled: process.env.NODE_ENV === 'production',
  
  // Environment tag
  environment: process.env.NODE_ENV,

  // Filter out noisy errors
  ignoreErrors: [
    'NEXT_NOT_FOUND',
    'NEXT_REDIRECT',
  ],

  beforeSend(event, hint) {
    const error = hint.originalException as Error | undefined
    
    // Add userId if available in the event context
    if (event.user?.id) {
      event.tags = { ...event.tags, userId: event.user.id }
    }

    // Tag Stripe webhook errors
    if (error?.message?.includes('stripe') || error?.message?.includes('webhook')) {
      event.tags = { ...event.tags, category: 'stripe' }
    }

    return event
  },
})
