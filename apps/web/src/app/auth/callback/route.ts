import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit'

// Allowlist of valid redirect paths (must start with /)
const ALLOWED_REDIRECT_PATHS = [
  '/app',
  '/app/agent',
  '/settings',
  '/pricing',
  '/reset-password',
]

/**
 * Validate redirect URL to prevent open redirect attacks
 * Only allows relative paths that are in the allowlist
 */
function validateRedirectPath(path: string): string {
  // Default to /app if no path provided
  if (!path) return '/app'
  
  // Must be a relative path (starts with /)
  if (!path.startsWith('/')) return '/app'
  
  // Block any absolute URLs or protocol-relative URLs
  if (path.startsWith('//') || path.includes('://')) return '/app'
  
  // Block paths with encoded characters that could bypass checks
  if (path.includes('%') || path.includes('\\')) return '/app'
  
  // Check if path starts with an allowed prefix
  const isAllowed = ALLOWED_REDIRECT_PATHS.some(allowed => 
    path === allowed || path.startsWith(`${allowed}/`)
  )
  
  return isAllowed ? path : '/app'
}

export async function GET(request: NextRequest) {
  // Rate limiting to prevent brute force attacks
  const rateLimitResponse = await checkRateLimit(request, 'auth-callback', RATE_LIMITS.authCallback)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/app'
  const referralCode = searchParams.get('ref')
  
  // Validate the redirect path to prevent open redirect attacks
  const validatedNext = validateRedirectPath(next)

  if (code) {
    // Build the success redirect response first, then attach session cookies to it.
    // This is the official Supabase SSR pattern — cookies must be set on the
    // actual response object, not via next/headers cookies(), to survive redirects.
    const redirectResponse = NextResponse.redirect(`${origin}${validatedNext}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              redirectResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      const isNewUser = data.user.created_at === data.user.last_sign_in_at ||
        (new Date(data.user.last_sign_in_at!).getTime() - new Date(data.user.created_at).getTime() < 10000)

      if (isNewUser) {
        if (referralCode) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.rpc as any)('complete_referral', {
              p_referral_code: referralCode.toUpperCase(),
              p_referee_id: data.user.id,
            })
          } catch (refError) {
            console.error('Failed to apply referral in callback:', refError)
          }
        }

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.rpc as any)('ensure_personal_workspace', {
            p_user_id: data.user.id,
          })
        } catch (wsError) {
          console.error('Failed to create personal workspace:', wsError)
        }
      }

      return redirectResponse
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=Could not authenticate`)
}
