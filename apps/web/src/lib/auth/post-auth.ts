import type { User } from '@supabase/supabase-js'

/**
 * Post-authentication side effects shared by /auth/callback (PKCE code
 * exchange) and /auth/confirm (token_hash / verifyOtp).
 */

/** Heuristic: created_at ≈ last_sign_in_at means this is the first sign-in. */
export function isNewUser(user: User): boolean {
  if (!user.last_sign_in_at) return true
  if (user.created_at === user.last_sign_in_at) return true
  return (
    new Date(user.last_sign_in_at).getTime() - new Date(user.created_at).getTime() < 10000
  )
}

/**
 * Apply the referral (if any) and make sure the user has a personal workspace.
 * Both calls are best-effort — a failure here must never block sign-in.
 */
export async function runNewUserSetup(
  // The generated Database types don't cover these RPCs; the call sites have
  // always cast through `any` for the same reason.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  user: User,
  referralCode: string | null
): Promise<void> {
  if (!isNewUser(user)) return

  if (referralCode) {
    try {
      await supabase.rpc('complete_referral', {
        p_referral_code: referralCode.toUpperCase(),
        p_referee_id: user.id,
      })
    } catch (refError) {
      console.error('Failed to apply referral in callback:', refError)
    }
  }

  try {
    await supabase.rpc('ensure_personal_workspace', {
      p_user_id: user.id,
    })
  } catch (wsError) {
    console.error('Failed to create personal workspace:', wsError)
  }
}
