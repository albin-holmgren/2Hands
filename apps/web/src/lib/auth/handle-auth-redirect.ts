import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit'
import { validateRedirectPath } from '@/lib/auth/redirect-paths'
import { runNewUserSetup } from '@/lib/auth/post-auth'

/**
 * Shared handler behind both /auth/callback and /auth/confirm.
 *
 * Supabase email templates can be written two ways and we do not control which
 * one a given project/template uses:
 *   - `{{ .ConfirmationURL }}` → lands here with `?code=` (PKCE). Requires the
 *     `…-code-verifier` cookie, so it only works on the device that started the
 *     flow.
 *   - `{{ .TokenHash }}`       → lands here with `?token_hash=&type=`. Verified
 *     server-side with `verifyOtp`, so it works cross-device (request the reset
 *     on a laptop, open the mail on a phone).
 *
 * Handling both on both routes means neither template choice, nor an old link
 * already sitting in someone's inbox, can dead-end.
 */

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

function parseOtpType(value: string | null): EmailOtpType | null {
  return value && (OTP_TYPES as string[]).includes(value) ? (value as EmailOtpType) : null
}

function signInWithError(origin: string, message: string) {
  return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(message)}`)
}

export async function handleAuthRedirect(request: NextRequest): Promise<NextResponse> {
  // Rate limiting to prevent brute force attacks
  const rateLimitResponse = await checkRateLimit(request, 'auth-callback', RATE_LIMITS.authCallback)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const otpType = parseOtpType(searchParams.get('type'))
  const referralCode = searchParams.get('ref')

  // Providers (and Supabase itself) report failures as ?error=&error_description=.
  // Surfacing the real reason is the difference between "link expired, request a
  // new one" and a blank sign-in form that explains nothing.
  const providerError = searchParams.get('error')
  const providerErrorDescription = searchParams.get('error_description')
  if (providerError) {
    return signInWithError(origin, providerErrorDescription || providerError)
  }

  // Validate the redirect path to prevent open redirect attacks
  const validatedNext = validateRedirectPath(searchParams.get('next'))

  if (!code && !tokenHash) {
    return signInWithError(origin, 'Could not authenticate')
  }

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

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      await runNewUserSetup(supabase, data.user, referralCode)
      return redirectResponse
    }

    return signInWithError(origin, error?.message || 'Could not authenticate')
  }

  if (!otpType) {
    return signInWithError(origin, 'Invalid or missing confirmation type')
  }

  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: otpType })

  if (!error && data.user) {
    await runNewUserSetup(supabase, data.user, referralCode)
    return redirectResponse
  }

  return signInWithError(origin, error?.message || 'Could not authenticate')
}
