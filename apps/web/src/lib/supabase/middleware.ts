import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { APP_HOME, validateRedirectPath } from '@/lib/auth/redirect-paths'

/**
 * Build a redirect response that carries over any auth cookies Supabase set on
 * `sourceResponse`.
 *
 * `supabase.auth.getUser()` can rotate the refresh token; when it does, the
 * `setAll` cookie handler rebuilds `supabaseResponse` with the new
 * `sb-*-auth-token` cookies. Returning a bare `NextResponse.redirect()` would
 * discard them — Supabase has already consumed the old refresh token
 * server-side, so the browser would be left holding a dead one and the user
 * gets silently signed out on the next request.
 */
function redirectPreservingCookies(url: URL, sourceResponse: NextResponse): NextResponse {
  const response = NextResponse.redirect(url)
  sourceResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie)
  })
  return response
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

  // The root is a doorway, not a page — everyone goes to the app.
  //
  // Doing this here rather than in app/page.tsx makes it a real 307. The page
  // reads searchParams, so it renders dynamically and Next streams the
  // redirect inside the RSC payload: the browser first receives a blank
  // document and only then navigates. Same destination, one less paint.
  //
  // Runs before the Supabase client is built, so the root costs no auth
  // round-trip; the session is refreshed by this same middleware on the very
  // next request, for APP_HOME.
  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = validateRedirectPath(request.nextUrl.searchParams.get('next'))
    url.search = ''
    return NextResponse.redirect(url)
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
    // The app surface itself is browsable signed-out, the way ChatGPT lets you
    // see the product before you have an account. Nothing here reads data
    // without a session: the shell renders its empty state, and the first
    // action that would touch the backend sends the visitor to sign-in.
    //
    // Exact match, deliberately — `/app` and everything else under it (the
    // legacy dashboard, settings) stays behind the session gate.
    pathname === APP_HOME ||
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
    // Carry cookies over: a failed refresh clears the stale auth cookies, and
    // those deletions must reach the browser.
    return redirectPreservingCookies(url, supabaseResponse)
  }

  // Redirect authenticated users away from auth pages and landing page
  if (user && (pathname === '/' || pathname.startsWith('/sign-in') || pathname.startsWith('/signup'))) {
    const url = request.nextUrl.clone()
    // Check for ?next= param and validate it
    const nextParam = request.nextUrl.searchParams.get('next')
    url.pathname = validateRedirectPath(nextParam)
    url.search = '' // Clear search params after extracting next
    // getUser() above may have rotated the refresh token — the new cookies
    // must ride along on this redirect or the session silently dies.
    return redirectPreservingCookies(url, supabaseResponse)
  }

  return supabaseResponse
}
