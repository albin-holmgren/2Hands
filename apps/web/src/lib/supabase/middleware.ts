import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// The application home. v3 cutover: 2hands.ai IS the app — signing in and
// hitting the root both land here (legacy dashboard: /app/legacy).
const APP_HOME = '/app/v3'

// Allowlist of valid redirect paths (must start with /)
const ALLOWED_REDIRECT_PREFIXES = [
  '/app',
  '/settings',
  '/pricing',
]

/**
 * Validate redirect URL to prevent open redirect attacks
 * Only allows relative paths that are in the allowlist
 */
function validateRedirectPath(path: string | null): string {
  // v3 cutover: the voice-first surface is the application, so it is the
  // default landing target (the legacy dashboard lives at /app/legacy).
  if (!path) return APP_HOME
  
  // Must be a relative path (starts with /)
  if (!path.startsWith('/')) return APP_HOME
  
  // Block any absolute URLs or protocol-relative URLs
  if (path.startsWith('//') || path.includes('://')) return APP_HOME
  
  // Block paths with encoded characters that could bypass checks
  if (path.includes('%') || path.includes('\\')) return APP_HOME
  
  // Check if path starts with an allowed prefix
  const isAllowed = ALLOWED_REDIRECT_PREFIXES.some(allowed => 
    path === allowed || path.startsWith(`${allowed}/`) || path.startsWith(`${allowed}?`)
  )
  
  return isAllowed ? path : APP_HOME
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const pathname = request.nextUrl.pathname
  const method = request.method.toUpperCase()

  // Preflight requests should never run auth redirects.
  if (method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 })
    const origin = request.headers.get('origin') || '*'
    const requestHeaders = request.headers.get('access-control-request-headers')
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', requestHeaders || 'authorization,content-type')
    response.headers.set('Vary', 'Origin, Access-Control-Request-Headers')
    return response
  }

  // Route handlers perform their own auth checks and should never be redirected
  // by middleware, regardless of matcher behavior.
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  // If Supabase fell back to the site URL (instead of /auth/callback) due to
  // missing allowlist entry, we get ?code= on a public page. Proxy it to the
  // callback route so the server-side handler can exchange it and redirect to /app.
  if (pathname !== '/auth/callback' && request.nextUrl.searchParams.has('code')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }

  // Middleware redirect/auth logic is only needed for page navigations.
  // Skip non-navigation methods to avoid accidental redirect loops/churn.
  if (method !== 'GET' && method !== 'HEAD') {
    return supabaseResponse
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseAnonKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Public routes that don't require auth
  const isPublicRoute = 
    pathname === '/' ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/about') ||
    pathname.startsWith('/features') ||
    pathname.startsWith('/overview') ||
    pathname.startsWith('/security') ||
    pathname.startsWith('/integrations') ||
    pathname.startsWith('/docs') ||
    pathname.startsWith('/changelog') ||
    pathname.startsWith('/pricing') ||
    pathname.startsWith('/startups') ||
    pathname.startsWith('/enterprises') ||
    pathname.startsWith('/use-cases') ||
    // First-party Demo Account Provider (deterministic browser-auth target for
    // dev/CI). Simulates an external site: never behind product auth; state
    // lives in its own demo_provider_* cookies.
    pathname.startsWith('/demo-provider')

  // Protected routes - redirect to login if not authenticated
  // Include ?next= param so user returns to intended page after login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    const returnTo = pathname + request.nextUrl.search
    url.pathname = '/sign-in'
    url.searchParams.set('next', returnTo)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages and landing page
  if (user && (pathname === '/' || pathname.startsWith('/sign-in') || pathname.startsWith('/signup'))) {
    const url = request.nextUrl.clone()
    // Check for ?next= param and validate it
    const nextParam = request.nextUrl.searchParams.get('next')
    url.pathname = validateRedirectPath(nextParam)
    url.search = '' // Clear search params after extracting next
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
